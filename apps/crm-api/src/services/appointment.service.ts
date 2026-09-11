import type { CreateAppointment, CreateBlock, RescheduleAppointment } from '@crm/contracts';
import type { AppointmentTransitionError } from '@crm/db';
import {
  cancelByOperator,
  createBlock as createBlockTransition,
  createManualAppointment as createManualAppointmentTransition,
  dateInDisplayTz,
  deleteBlock as deleteBlockTransition,
  issueConfirmationToken,
  markAttendance as markAttendanceTransition,
  rescheduleAppointment as rescheduleAppointmentTransition,
  timeInDisplayTz,
  wallClockToUtc,
} from '@crm/db';
import { env } from '../config/env.config.js';
import type { AppointmentRecord } from '../repositories/appointment.repository.js';
import * as appointmentRepository from '../repositories/appointment.repository.js';
import * as customerRepository from '../repositories/customer.repository.js';
import * as professionalRepository from '../repositories/professional.repository.js';

// Camada de orquestração do operador (spec.md P1 "Operador opera a agenda no
// CRM"): converte hora de parede -> UTC (wallClockToUtc, T1) ANTES de chamar
// qualquer transição de @crm/db (AD-036 — nenhuma transição aceita hora de
// parede) e traduz o `code` tipado das transições (packages/db,
// appointmentTransitions.ts) para um erro tipado, mesmo idioma de
// order.service.ts (erro tipado aqui, status HTTP só no controller, T24/T25).
export class AppointmentNotFoundError extends Error {}
export class AppointmentConflictError extends Error {}
export class AppointmentTerminalError extends Error {}

// `invalid` (professionalId/spaceId que não pertence ao tenant) se comporta,
// da perspectiva do operador, como "recurso não encontrado" — mesmo
// tratamento de not_found. `expired` nunca ocorre em nenhum caminho deste
// service (só confirmByToken/cancelByToken, T22, na rota pública) — fallback
// apenas para exaustividade de tipo, nunca esperado de fato.
const translateTransitionError = (result: AppointmentTransitionError): Error => {
  if (result.code === 'not_found' || result.code === 'invalid') return new AppointmentNotFoundError(result.error);
  if (result.code === 'conflict') return new AppointmentConflictError(result.error);
  if (result.code === 'terminal') return new AppointmentTerminalError(result.error);
  return new Error(result.error);
};

// Recarrega o registro já resolvido (nomes incluídos) do T21 depois de uma
// mutação bem-sucedida — nunca reconstrói o record à mão a partir do
// AppointmentDocument cru devolvido pela transição, reaproveitando a mesma
// leitura tenant-scoped/resolvida em lote em vez de duplicá-la aqui.
const requireAppointmentRecord = async (tenantId: string, appointmentId: string): Promise<AppointmentRecord> => {
  const record = await appointmentRepository.findById(tenantId, appointmentId);
  if (!record) throw new AppointmentNotFoundError('Appointment não encontrado');
  return record;
};

export type AppointmentDateRange = {
  from: string; // YYYY-MM-DD, hora de parede
  to: string; // YYYY-MM-DD, hora de parede — EXCLUSIVO (design.md)
  professionalId?: string;
  spaceId?: string;
};

// SCH-29: `from`/`to` chegam em hora de parede (00:00 do dia) — a conversão
// pro instante UTC de fronteira é a mesma wallClockToUtc usada em todo canto
// desta feature, nunca uma segunda implementação do cálculo.
export const listAppointments = async (
  tenantId: string,
  params: AppointmentDateRange,
): Promise<AppointmentRecord[]> => {
  const fromUtc = wallClockToUtc(params.from, '00:00');
  const toUtc = wallClockToUtc(params.to, '00:00');
  return appointmentRepository.listByRange(tenantId, fromUtc, toUtc, params.professionalId, params.spaceId);
};

// SCH-38: `null` é um estado válido (nenhum agendamento futuro ativo), nunca
// erro.
export const getUpcomingByCustomer = async (tenantId: string, customerId: string): Promise<AppointmentRecord | null> =>
  appointmentRepository.findNextActiveByCustomer(tenantId, customerId, new Date());

// SCH-30: encaixe do operador — sem duração própria no contrato (só
// date+time do início), a duração vem do slotDurationMinutes ATUAL do
// profissional (mesma convenção de bookAppointment em packages/db). O
// profissional é resolvido aqui (não só dentro da transição) porque a
// duração depende dele — um professionalId que não pertence ao tenant vira
// 404 antes mesmo de chamar a transição.
export const createManualAppointment = async (
  tenantId: string,
  input: CreateAppointment,
): Promise<AppointmentRecord> => {
  const professional = await professionalRepository.findById(tenantId, input.professionalId);
  if (!professional) throw new AppointmentNotFoundError('Profissional não encontrado');

  const start = wallClockToUtc(input.date, input.time);
  const end = new Date(start.getTime() + professional.slotDurationMinutes * 60_000);

  const result = await createManualAppointmentTransition({
    tenantId,
    professionalId: input.professionalId,
    start,
    end,
    customerId: input.customerId,
    spaceId: input.spaceId,
    notes: input.notes,
  });
  if ('error' in result) throw translateTransitionError(result);

  return requireAppointmentRecord(tenantId, result.appointment._id.toString());
};

// SCH-33: bloqueio — `start`/`end` vêm inteiros do contrato (duas datas+horas
// de parede), sem cálculo de duração.
export const createBlock = async (tenantId: string, input: CreateBlock): Promise<AppointmentRecord> => {
  const professional = await professionalRepository.findById(tenantId, input.professionalId);
  if (!professional) throw new AppointmentNotFoundError('Profissional não encontrado');

  const start = wallClockToUtc(input.startDate, input.startTime);
  const end = wallClockToUtc(input.endDate, input.endTime);

  const result = await createBlockTransition({
    tenantId,
    professionalId: input.professionalId,
    start,
    end,
    title: input.title,
  });
  if ('error' in result) throw translateTransitionError(result);

  return requireAppointmentRecord(tenantId, result._id.toString());
};

export const deleteBlock = async (tenantId: string, blockId: string): Promise<{ deleted: true }> => {
  const result = await deleteBlockTransition(tenantId, blockId);
  if ('error' in result) throw translateTransitionError(result);
  return result;
};

// SCH-32: cancelamento pelo operador, com motivo opcional.
export const cancelAppointment = async (
  tenantId: string,
  appointmentId: string,
  userId: string,
  reason?: string,
): Promise<AppointmentRecord> => {
  const result = await cancelByOperator(tenantId, appointmentId, userId, reason);
  if ('error' in result) throw translateTransitionError(result);
  return requireAppointmentRecord(tenantId, appointmentId);
};

// SCH-31: mesmo Appointment, novo horário (hora de parede) e profissional
// opcional.
export const rescheduleAppointment = async (
  tenantId: string,
  appointmentId: string,
  input: RescheduleAppointment,
): Promise<AppointmentRecord> => {
  const start = wallClockToUtc(input.date, input.time);
  const result = await rescheduleAppointmentTransition(tenantId, appointmentId, {
    start,
    professionalId: input.professionalId,
  });
  if ('error' in result) throw translateTransitionError(result);
  return requireAppointmentRecord(tenantId, appointmentId);
};

// SCH-34: comparecimento.
export const markAttendance = async (
  tenantId: string,
  appointmentId: string,
  userId: string,
  status: 'completed' | 'no_show',
): Promise<AppointmentRecord> => {
  const result = await markAttendanceTransition(tenantId, appointmentId, userId, status);
  if ('error' in result) throw translateTransitionError(result);
  return requireAppointmentRecord(tenantId, appointmentId);
};

export type ConfirmationLink = {
  confirmationUrl: string;
  waMeUrl: string;
};

// SCH-37: "Pedir confirmação" — reemite o token (T6/T9,
// issueConfirmationToken invalida o anterior, SCH-24), monta a URL pública
// consumida por apps/web e o link wa.me com o texto pronto (mesma convenção
// de wa.me/<telefone-como-gravado> de composer.tsx, agora com `?text=`
// codificado — sem precedente no repo para essa parte, mantido simples).
export const requestConfirmationLink = async (tenantId: string, appointmentId: string): Promise<ConfirmationLink> => {
  const issued = await issueConfirmationToken(tenantId, appointmentId);
  if ('error' in issued) throw translateTransitionError(issued);

  const appointment = await requireAppointmentRecord(tenantId, appointmentId);
  if (!appointment.customer) throw new AppointmentNotFoundError('Appointment sem cliente vinculado');

  const customer = await customerRepository.findById(tenantId, appointment.customer);
  if (!customer) throw new AppointmentNotFoundError('Cliente não encontrado');

  const confirmationUrl = `${env.WEB_BASE_URL}/appointment?token=${issued.confirmationToken}`;
  const text = `Olá! Confirme ou cancele seu agendamento de ${dateInDisplayTz(appointment.start)} às ${timeInDisplayTz(appointment.start)} pelo link: ${confirmationUrl}`;
  const waMeUrl = `https://wa.me/${customer.phone}?text=${encodeURIComponent(text)}`;

  return { confirmationUrl, waMeUrl };
};
