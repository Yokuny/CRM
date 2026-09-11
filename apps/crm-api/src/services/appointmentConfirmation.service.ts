import type { AppointmentDocument, AppointmentStatus, AppointmentTransitionError } from '@crm/db';
import {
  Appointment,
  Customer,
  cancelByToken as cancelByTokenTransition,
  confirmByToken as confirmByTokenTransition,
  dateInDisplayTz,
  hashToken,
  Professional,
  Space,
  tenantScoped,
  timeInDisplayTz,
} from '@crm/db';

// spec.md SCH-22/SCH-27: a única rota anônima da feature — identificada
// EXCLUSIVAMENTE pelo token (nunca id de agendamento). Erros tipados aqui,
// traduzidos pro HTTP certo no controller (mesmo idioma de
// order.service.ts): not_found->404, expired->410, terminal->409.
export class AppointmentConfirmationNotFoundError extends Error {}
export class AppointmentConfirmationExpiredError extends Error {}
export class AppointmentConfirmationTerminalError extends Error {}

// SCH-22: "nunca dados de outro agendamento" — o formato da resposta em si
// impede o cruzamento mesmo que um id vaze por outro canal: zero ids
// internos (nada de `_id`, `professional`, `customer` como ObjectId).
export type AppointmentConfirmationPublicView = {
  date: string; // YYYY-MM-DD, fuso de exibição (AD-036)
  time: string; // HH:mm, fuso de exibição
  professionalName?: string;
  spaceName?: string;
  customerName?: string;
  status: AppointmentStatus;
};

// Nomes resolvidos por consulta avulsa (um único Appointment por chamada,
// sem custo de lote aqui — diferente de appointment.repository.listByRange).
// Escopadas ao Tenant do PRÓPRIO agendamento encontrado (nunca um filtro
// vindo de fora, já que a requisição não carrega tenant nenhum) — defesa em
// profundidade além do hash único, mesmo espírito de AD-010.
const toPublicView = async (appointment: AppointmentDocument): Promise<AppointmentConfirmationPublicView> => {
  const tenantId = appointment.Tenant.toString();

  const [professional, space, customer] = await Promise.all([
    Professional.findOne(tenantScoped({ Tenant: tenantId, _id: appointment.professional }))
      .select('name')
      .lean(),
    appointment.space
      ? Space.findOne(tenantScoped({ Tenant: tenantId, _id: appointment.space }))
          .select('name')
          .lean()
      : null,
    appointment.customer
      ? Customer.findOne(tenantScoped({ Tenant: tenantId, _id: appointment.customer }))
          .select('name')
          .lean()
      : null,
  ]);

  return {
    date: dateInDisplayTz(appointment.start),
    time: timeInDisplayTz(appointment.start),
    professionalName: professional?.name,
    spaceName: space?.name,
    customerName: customer?.name,
    status: appointment.status,
  };
};

const isTransitionError = (result: unknown): result is AppointmentTransitionError =>
  typeof result === 'object' && result !== null && 'error' in result;

// Traduz o `code` de confirmByToken/cancelByToken (packages/db,
// appointmentTransitions.ts) para o erro tipado correspondente — mesma
// separação de order.service.ts (erro tipado aqui, status HTTP só no
// controller, T24/T25 já usam este mesmo padrão para appointment.service).
const translateTransitionResult = async (
  result: AppointmentDocument | AppointmentTransitionError,
): Promise<AppointmentConfirmationPublicView> => {
  if (isTransitionError(result)) {
    if (result.code === 'not_found') throw new AppointmentConfirmationNotFoundError(result.error);
    if (result.code === 'expired') throw new AppointmentConfirmationExpiredError(result.error);
    throw new AppointmentConfirmationTerminalError(result.error);
  }
  return toPublicView(result);
};

// GET /:token (SCH-22/SCH-23): identificado exclusivamente pelo hash — sem
// nenhum filtro de tenant (o próprio token, único+sparse indexado, é a
// fronteira de segurança aqui).
export const getByToken = async (token: string): Promise<AppointmentConfirmationPublicView> => {
  const tokenHash = hashToken(token);
  const appointment = await Appointment.findOne({ confirmationTokenHash: tokenHash }).lean();
  if (!appointment) throw new AppointmentConfirmationNotFoundError('Link de confirmação não encontrado');
  if (appointment.confirmationExpiresAt && appointment.confirmationExpiresAt.getTime() < Date.now()) {
    throw new AppointmentConfirmationExpiredError('Link de confirmação expirado');
  }
  return toPublicView(appointment);
};

// POST /:token/confirm (SCH-25): idempotente por construção de
// confirmByToken (packages/db) — repetir sobre `confirmed` devolve 200 com o
// mesmo estado, nunca erro.
export const confirmByToken = async (token: string): Promise<AppointmentConfirmationPublicView> =>
  translateTransitionResult(await confirmByTokenTransition(hashToken(token)));

// POST /:token/cancel (SCH-26): mesma tradução de erro de confirmByToken
// acima.
export const cancelByToken = async (token: string): Promise<AppointmentConfirmationPublicView> =>
  translateTransitionResult(await cancelByTokenTransition(hashToken(token)));
