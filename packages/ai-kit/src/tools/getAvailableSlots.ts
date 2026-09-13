import type { AppointmentStatus, ProfessionalDocument } from '@crm/db';
import {
  Appointment,
  Conversation,
  computeFreeSlots,
  DEFAULT_MAX_SLOTS,
  dateInDisplayTz,
  MAX_HORIZON_DAYS,
  Professional,
  SchedulingSettings,
  tenantScoped,
  timeInDisplayTz,
  wallClockToUtc,
} from '@crm/db';
import type { ToolContext } from './toolContext.js';

export type GetAvailableSlotsInput = { date: string; professionalId?: string };

export type AvailableSlot = {
  start: string;
  time: string;
  professionals: Array<{ id: string; name: string }>;
};

export type UpcomingAppointment = {
  date: string;
  time: string;
  professionalName?: string;
  status: AppointmentStatus;
};

export type GetAvailableSlotsResult = {
  date: string;
  slots: AvailableSlot[];
  upcomingAppointments: UpcomingAppointment[];
};

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const ACTIVE_STATUSES = ['pending', 'confirmed'] as const;

// Meio-dia UTC de uma data-calendário 'YYYY-MM-DD' — não é conversão de fuso
// (isso é wallClockToUtc), é só um ponto fixo pra fazer aritmética de
// dias-de-calendário entre duas strings sem ambiguidade de borda.
const calendarNoonUtc = (date: string): number => {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year as number, (month as number) - 1, day as number, 12);
};

const addDays = (date: string, days: number): string =>
  new Date(calendarNoonUtc(date) + days * 86_400_000).toISOString().slice(0, 10);

// SCH-10: fora do formato, antes de hoje (na hora de exibição) ou a mais de
// 90 dias -> inválida. Checagem puramente textual/aritmética — nenhuma query
// roda antes desta validação passar.
const isValidDate = (date: string, today: string): boolean => {
  if (!DATE_REGEX.test(date)) return false;
  if (date < today) return false;
  const diffDays = Math.round((calendarNoonUtc(date) - calendarNoonUtc(today)) / 86_400_000);
  return diffDays <= MAX_HORIZON_DAYS;
};

// SCH-09..14 (Anel A, consulta autônoma — molde de searchProducts.ts): nunca
// lança, toda query tenantScoped. `professionalId` ausente -> todos os
// `Professional` ativos do tenant (tenant sem nenhum -> lista de slots vazia,
// spec.md Edge Cases — computeFreeSlots com professionals:[] simplesmente não
// gera nada, sem código especial aqui).
export const getAvailableSlots = async (
  input: GetAvailableSlotsInput,
  ctx: ToolContext,
): Promise<GetAvailableSlotsResult | { error: string }> => {
  const now = new Date();
  const today = dateInDisplayTz(now);
  if (!isValidDate(input.date, today)) {
    return { error: 'Data inválida — use o formato YYYY-MM-DD, de hoje até 90 dias à frente' };
  }

  let professionals: ProfessionalDocument[];
  if (input.professionalId) {
    const professional = await Professional.findOne(
      tenantScoped({ Tenant: ctx.tenantId, _id: input.professionalId, active: true }),
    ).lean();
    if (!professional) return { error: 'Profissional não encontrado, inativo ou de outro tenant' };
    professionals = [professional];
  } else {
    professionals = await Professional.find(tenantScoped({ Tenant: ctx.tenantId, active: true })).lean();
  }

  const professionalIds = professionals.map((p) => p._id.toString());
  const dayStartUtc = wallClockToUtc(input.date, '00:00');
  const dayEndUtc = wallClockToUtc(addDays(input.date, 1), '00:00');

  // Ocupação (agendamento ativo E bloqueio — os dois têm status pending/
  // confirmed) que se sobrepõe à janela do dia consultado, por profissional.
  const busyDocs = professionalIds.length
    ? await Appointment.find(
        tenantScoped({
          Tenant: ctx.tenantId,
          professional: { $in: professionalIds },
          status: { $in: ACTIVE_STATUSES },
          start: { $lt: dayEndUtc },
          end: { $gt: dayStartUtc },
        }),
      )
        .select('professional start end')
        .lean()
    : [];

  const busy = busyDocs.map((doc) => ({
    professionalId: doc.professional.toString(),
    start: doc.start,
    end: doc.end,
  }));

  const settings = await SchedulingSettings.findOne(tenantScoped({ Tenant: ctx.tenantId })).lean();
  const maxSlots = settings?.maxSlotsPerResponse ?? DEFAULT_MAX_SLOTS;

  const freeSlots = computeFreeSlots({
    professionals: professionals.map((p) => ({
      id: p._id.toString(),
      name: p.name,
      weeklySchedule: p.weeklySchedule,
      slotDurationMinutes: p.slotDurationMinutes,
    })),
    busy,
    date: input.date,
    now,
    maxSlots,
  });

  const slots: AvailableSlot[] = freeSlots.map((slot) => ({
    start: slot.start.toISOString(),
    time: slot.time,
    professionals: slot.professionals,
  }));

  // SCH-14 + spec.md Edge Cases ("mesma defesa em profundidade de
  // create_order"): Customer resolvido SÓ pela Conversation do ToolContext —
  // esta tool nem tem campo de customer no input_schema. Conversation não
  // encontrada (outro tenant/apagada) nunca deveria acontecer; {error} em vez
  // de arriscar vazar dado de outro tenant.
  const conversation = await Conversation.findOne(
    tenantScoped({ Tenant: ctx.tenantId, _id: ctx.conversationId }),
  ).lean();
  if (!conversation) return { error: 'Conversa não encontrada' };

  const upcomingDocs = await Appointment.find(
    tenantScoped({
      Tenant: ctx.tenantId,
      kind: 'appointment' as const,
      customer: conversation.Customer,
      status: { $in: ACTIVE_STATUSES },
      start: { $gt: now },
    }),
  )
    .sort({ start: 1 })
    .lean();

  const upcomingProfessionalIds = [...new Set(upcomingDocs.map((doc) => doc.professional.toString()))];
  const upcomingProfessionals = upcomingProfessionalIds.length
    ? await Professional.find(tenantScoped({ Tenant: ctx.tenantId, _id: { $in: upcomingProfessionalIds } }))
        .select('name')
        .lean()
    : [];
  const professionalNameById = new Map(upcomingProfessionals.map((p) => [p._id.toString(), p.name]));

  const upcomingAppointments: UpcomingAppointment[] = upcomingDocs.map((doc) => ({
    date: dateInDisplayTz(doc.start),
    time: timeInDisplayTz(doc.start),
    professionalName: professionalNameById.get(doc.professional.toString()),
    status: doc.status,
  }));

  return { date: input.date, slots, upcomingAppointments };
};
