import {
  bookAppointment as bookAppointmentTransition,
  Conversation,
  dateInDisplayTz,
  Professional,
  Space,
  tenantScoped,
  timeInDisplayTz,
} from '@crm/db';
import type { ToolContext } from './toolContext.js';

export type BookAppointmentInput = { professionalId: string; start: string; spaceId?: string };

export type BookAppointmentResult = {
  appointmentId: string;
  date: string;
  time: string;
  professionalName: string;
  spaceName?: string;
  status: 'pending';
  confirmationUrl: string;
};

// Anel A: reserva autônoma. `customerId` NUNCA é campo de input — resolvido
// só pela Conversation do ToolContext (mesma defesa em profundidade de
// createOrder.ts). Sem `ctx.webBaseUrl`, {error} ANTES de qualquer escrita
// (mesmo idioma de issue_payment_link sem integração ativa): agendar sem
// conseguir entregar o link violaria SCH-15.
export const bookAppointment = async (
  input: BookAppointmentInput,
  ctx: ToolContext,
): Promise<BookAppointmentResult | { error: string }> => {
  if (!ctx.webBaseUrl) return { error: 'Agendamento indisponível no momento (configuração ausente)' };

  const conversation = await Conversation.findOne(
    tenantScoped({ Tenant: ctx.tenantId, _id: ctx.conversationId }),
  ).lean();
  if (!conversation) return { error: 'Conversa não encontrada' };

  const start = new Date(input.start);
  if (Number.isNaN(start.getTime()))
    return { error: 'start inválido — use o valor ISO devolvido por get_available_slots' };

  const result = await bookAppointmentTransition({
    tenantId: ctx.tenantId,
    professionalId: input.professionalId,
    start,
    spaceId: input.spaceId,
    customerId: conversation.Customer.toString(),
    conversationId: ctx.conversationId,
    source: 'ai',
  });

  if ('error' in result) return { error: result.error };

  const { appointment, confirmationToken } = result;

  const [professional, space] = await Promise.all([
    Professional.findOne(tenantScoped({ Tenant: ctx.tenantId, _id: appointment.professional })).lean(),
    appointment.space
      ? Space.findOne(tenantScoped({ Tenant: ctx.tenantId, _id: appointment.space })).lean()
      : Promise.resolve(null),
  ]);

  return {
    appointmentId: appointment._id.toString(),
    date: dateInDisplayTz(appointment.start),
    time: timeInDisplayTz(appointment.start),
    professionalName: professional?.name ?? '',
    spaceName: space?.name,
    status: 'pending',
    confirmationUrl: `${ctx.webBaseUrl}/appointment?token=${confirmationToken}`,
  };
};
