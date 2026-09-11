import crypto from 'node:crypto';
import type { AppointmentDocument, AppointmentSource } from './models/appointment.model.js';
import { Appointment } from './models/appointment.model.js';
import { hashToken } from './models/invite.model.js';
import { Professional } from './models/professional.model.js';
import { Space } from './models/space.model.js';
import { isSlotAligned, MAX_HORIZON_DAYS, MIN_LEAD_MINUTES } from './scheduling.js';
import { tenantScoped } from './tenantScoped.js';

// Única implementação da máquina de estados de Appointment (AD-035, molde de
// orderTransitions.ts/AD-033) — chamada tanto por apps/crm-api (operador e
// rota pública de confirmação) quanto por apps/ai-gateway/packages/ai-kit
// (tool book_appointment), nunca duplicada. Diferente de orderTransitions.ts,
// todo retorno de erro aqui carrega um `code` (design.md, Components) para
// quem chama traduzir em HTTP sem precisar interpretar a mensagem.

export type AppointmentTransitionErrorCode = 'not_found' | 'expired' | 'terminal' | 'conflict' | 'invalid';
export interface AppointmentTransitionError {
  error: string;
  code: AppointmentTransitionErrorCode;
}

const NOT_FOUND_ERROR: AppointmentTransitionError = { error: 'Appointment não encontrado', code: 'not_found' };
const CONFLICT_ERROR: AppointmentTransitionError = { error: 'Horário indisponível', code: 'conflict' };
const INVALID_ERROR: AppointmentTransitionError = { error: 'Dados de agendamento inválidos', code: 'invalid' };

const ACTIVE_STATUSES = ['pending', 'confirmed'] as const;

// Alfabeto do `generateSecureCode` da referência (base62, sem símbolos —
// sobrevive ao guard.output, verificado por execução no Design). Token final:
// `apt_` + 32 caracteres, nunca persistido em texto claro (só o sha256 de
// hashToken, invite.model.ts).
const BASE62_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

const generateConfirmationToken = (): string => {
  const bytes = crypto.randomBytes(32);
  let token = '';
  for (let i = 0; i < bytes.length; i++) {
    token += BASE62_ALPHABET[(bytes[i] as number) % BASE62_ALPHABET.length];
  }
  return `apt_${token}`;
};

const isDuplicateKeyError = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && 'code' in err && (err as { code?: number }).code === 11000;

export interface BookAppointmentInput {
  tenantId: string;
  professionalId: string;
  start: Date;
  spaceId?: string;
  customerId: string;
  conversationId?: string;
  source: AppointmentSource;
}

export interface BookAppointmentSuccess {
  appointment: AppointmentDocument;
  confirmationToken: string;
}

// Caminho da IA: valida alinhamento/antecedência/horizonte/pertencimento ao
// tenant, resolve `end` pela duração do profissional, e confia no índice
// único parcial {Tenant,professional,start} para a corrida — nunca
// checar-antes-de-gravar (AD-035, lição L-027). O token em texto claro sai
// só neste retorno; o hash vai no MESMO documento (SCH-17: nenhum Appointment
// sem token nem token órfão, por construção — um único Appointment.create()).
export const bookAppointment = async (
  input: BookAppointmentInput,
): Promise<BookAppointmentSuccess | AppointmentTransitionError> => {
  const { tenantId, professionalId, start, spaceId, customerId, conversationId, source } = input;

  const professional = await Professional.findOne(tenantScoped({ Tenant: tenantId, _id: professionalId })).lean();
  if (!professional?.active) return INVALID_ERROR;

  if (spaceId) {
    const space = await Space.findOne(tenantScoped({ Tenant: tenantId, _id: spaceId })).lean();
    if (!space) return INVALID_ERROR;
  }

  if (!isSlotAligned(start, professional)) return INVALID_ERROR;

  const now = new Date();
  // Cobre tanto "no passado" quanto "a menos de 60min" — um start passado
  // sempre falha esta mesma conta (SCH-16).
  if (start.getTime() - now.getTime() < MIN_LEAD_MINUTES * 60_000) return INVALID_ERROR;
  if (start.getTime() - now.getTime() > MAX_HORIZON_DAYS * 24 * 60 * 60_000) return INVALID_ERROR;

  const end = new Date(start.getTime() + professional.slotDurationMinutes * 60_000);

  // SCH-18: no máximo 1 agendamento futuro ativo por cliente; retry exato
  // (mesmo profissional+start) devolve o existente em vez de criar/errar.
  const existingActive = await Appointment.findOne(
    tenantScoped({
      Tenant: tenantId,
      kind: 'appointment' as const,
      customer: customerId,
      status: { $in: ACTIVE_STATUSES },
      start: { $gt: now },
    }),
  ).lean();

  if (existingActive) {
    const isExactRetry =
      existingActive.professional.toString() === professionalId && existingActive.start.getTime() === start.getTime();
    if (!isExactRetry) return CONFLICT_ERROR;

    // Retry idempotente: o token em claro só existe no retorno original, que
    // já se perdeu — reemitimos pelo mesmo caminho de issueConfirmationToken
    // (documentado aqui em vez de inventar uma 2ª forma de "reconstruir" um
    // token que nunca foi persistido em claro).
    const reissued = await issueConfirmationToken(tenantId, existingActive._id.toString());
    if ('error' in reissued) return reissued;
    const reloaded = await Appointment.findById(existingActive._id).lean();
    if (!reloaded) return NOT_FOUND_ERROR;
    return { appointment: reloaded, confirmationToken: reissued.confirmationToken };
  }

  const confirmationToken = generateConfirmationToken();
  const confirmationTokenHash = hashToken(confirmationToken);

  try {
    const appointment = await Appointment.create({
      Tenant: tenantId,
      kind: 'appointment',
      professional: professionalId,
      space: spaceId,
      customer: customerId,
      conversation: conversationId,
      start,
      end,
      status: 'pending',
      source,
      confirmationTokenHash,
      confirmationExpiresAt: end,
    });

    console.log(JSON.stringify({ event: 'appointment_booked', tenantId, appointmentId: appointment._id.toString() }));
    return { appointment, confirmationToken };
  } catch (err) {
    if (isDuplicateKeyError(err)) return CONFLICT_ERROR;
    throw err;
  }
};

// Reemite o token de confirmação: sobrescreve o hash (o anterior deixa de
// resolver qualquer coisa, SCH-24) e refixa a validade no `end` ATUAL do
// documento — importante para o caminho de remarcação (T9), que chama isto
// indiretamente ao mover a validade para o novo horário.
export const issueConfirmationToken = async (
  tenantId: string,
  appointmentId: string,
): Promise<{ confirmationToken: string } | AppointmentTransitionError> => {
  const appointment = await Appointment.findOne(tenantScoped({ Tenant: tenantId, _id: appointmentId })).lean();
  if (!appointment) return NOT_FOUND_ERROR;

  const confirmationToken = generateConfirmationToken();
  const confirmationTokenHash = hashToken(confirmationToken);

  await Appointment.updateOne(tenantScoped({ Tenant: tenantId, _id: appointmentId }), {
    $set: { confirmationTokenHash, confirmationExpiresAt: appointment.end },
  });

  return { confirmationToken };
};
