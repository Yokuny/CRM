import crypto from 'node:crypto';
import type { AppointmentDocument, AppointmentSource } from './models/appointment.model.js';
import { Appointment } from './models/appointment.model.js';
import { hashToken } from './models/invite.model.js';
import { Professional } from './models/professional.model.js';
import { Space } from './models/space.model.js';
import { isSlotAligned, MAX_HORIZON_DAYS, MIN_LEAD_MINUTES, overlaps } from './scheduling.js';
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
const EXPIRED_ERROR: AppointmentTransitionError = { error: 'Token de confirmação expirado', code: 'expired' };
const TERMINAL_ERROR: AppointmentTransitionError = {
  error: 'Appointment já está em estado terminal',
  code: 'terminal',
};
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

// Janela de checagem de sobreposição do caminho do operador (encaixe/
// bloqueio/remarcação): check-antes-de-gravar, aceito e documentado em
// AD-035 (baixa concorrência humana, diferente do caminho da IA que é
// coberto pelo índice único). O filtro do Mongo só reduz candidatos por
// `start < end` (mantém o range indexado por {Tenant,start}); a precisão do
// "sobrepõe ou não" fica com `overlaps()` (scheduling.ts), a mesma função
// pura usada por get_available_slots — nunca uma segunda implementação do
// mesmo cálculo. Cobre agendamento ativo E bloqueio: os dois têm status
// pending/confirmed (bloqueio nasce e permanece confirmed).
const hasOverlappingActive = async (
  tenantId: string,
  professionalId: string,
  interval: { start: Date; end: Date },
  excludeId?: string,
): Promise<boolean> => {
  const filter: Record<string, unknown> = tenantScoped({
    Tenant: tenantId,
    professional: professionalId,
    status: { $in: ACTIVE_STATUSES },
    start: { $lt: interval.end },
  });
  if (excludeId) filter._id = { $ne: excludeId };

  const candidates = await Appointment.find(filter).select('start end').lean();
  return candidates.some((candidate) => overlaps(interval, candidate));
};

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

// Identificado EXCLUSIVAMENTE pelo hash do token (SCH-27) — nunca por id.
// Sem `tenantId`: o próprio token é a fronteira de segurança aqui (índice
// único sparse em confirmationTokenHash), não um filtro por tenant — quem
// chama já hasheou o token em claro antes de invocar isto.
export const confirmByToken = async (tokenHash: string): Promise<AppointmentDocument | AppointmentTransitionError> => {
  const appointment = await Appointment.findOne({ confirmationTokenHash: tokenHash }).lean();
  if (!appointment) return NOT_FOUND_ERROR;
  if (appointment.confirmationExpiresAt && appointment.confirmationExpiresAt.getTime() < Date.now()) {
    return EXPIRED_ERROR;
  }

  // Idempotente (SCH-25): repetir a mesma ação sobre o mesmo estado não erra.
  if (appointment.status === 'confirmed') return appointment;
  if (appointment.status !== 'pending') return TERMINAL_ERROR;

  const updated = await Appointment.findOneAndUpdate(
    { confirmationTokenHash: tokenHash, status: 'pending' as const },
    { $set: { status: 'confirmed' as const, confirmedAt: new Date() } },
    { returnDocument: 'after' },
  ).lean();
  if (!updated) return NOT_FOUND_ERROR;

  console.log(
    JSON.stringify({
      event: 'appointment_confirmed',
      tenantId: updated.Tenant.toString(),
      appointmentId: updated._id.toString(),
    }),
  );
  return updated;
};

// Idem confirmByToken: só pelo hash, nunca id (SCH-27).
export const cancelByToken = async (tokenHash: string): Promise<AppointmentDocument | AppointmentTransitionError> => {
  const appointment = await Appointment.findOne({ confirmationTokenHash: tokenHash }).lean();
  if (!appointment) return NOT_FOUND_ERROR;
  if (appointment.confirmationExpiresAt && appointment.confirmationExpiresAt.getTime() < Date.now()) {
    return EXPIRED_ERROR;
  }

  // Idempotente na mesma ação repetida — por simetria com SCH-25 (aplicado
  // lá a confirmar), repetir cancelar sobre já-cancelado-pelo-cliente não
  // erra.
  if (appointment.status === 'canceled_by_customer') return appointment;
  if (appointment.status !== 'pending' && appointment.status !== 'confirmed') return TERMINAL_ERROR;

  const updated = await Appointment.findOneAndUpdate(
    { confirmationTokenHash: tokenHash, status: { $in: ACTIVE_STATUSES } },
    { $set: { status: 'canceled_by_customer' as const, canceledAt: new Date() } },
    { returnDocument: 'after' },
  ).lean();
  if (!updated) return NOT_FOUND_ERROR;

  console.log(
    JSON.stringify({
      event: 'appointment_canceled',
      tenantId: updated.Tenant.toString(),
      appointmentId: updated._id.toString(),
      canceledBy: 'customer',
    }),
  );
  return updated;
};

export interface CreateManualAppointmentInput {
  tenantId: string;
  professionalId: string;
  start: Date;
  end: Date;
  customerId: string;
  spaceId?: string;
  notes?: string;
}

// Caminho do encaixe do operador (SCH-30): sem alinhamento/antecedência/
// horizonte (esses tetos existem para conter a IA, não a pessoa — spec.md
// Assumptions) — a única regra que continua valendo é não sobrepor o mesmo
// profissional (impossível no mundo físico), verificada por
// hasOverlappingActive contra agendamentos ativos E bloqueios.
export const createManualAppointment = async (
  input: CreateManualAppointmentInput,
): Promise<BookAppointmentSuccess | AppointmentTransitionError> => {
  const { tenantId, professionalId, start, end, customerId, spaceId, notes } = input;

  // Mesma fronteira de tenant que bookAppointment (AD-010) — o encaixe
  // dispensa grade/antecedência/horizonte, mas nunca dispensa pertencimento
  // ao tenant: sem isso um professionalId de outro tenant criaria um
  // Appointment com Tenant/professional inconsistentes.
  const professional = await Professional.findOne(tenantScoped({ Tenant: tenantId, _id: professionalId })).lean();
  if (!professional) return INVALID_ERROR;

  if (spaceId) {
    const space = await Space.findOne(tenantScoped({ Tenant: tenantId, _id: spaceId })).lean();
    if (!space) return INVALID_ERROR;
  }

  const conflict = await hasOverlappingActive(tenantId, professionalId, { start, end });
  if (conflict) return CONFLICT_ERROR;

  const confirmationToken = generateConfirmationToken();
  const confirmationTokenHash = hashToken(confirmationToken);

  try {
    const appointment = await Appointment.create({
      Tenant: tenantId,
      kind: 'appointment',
      professional: professionalId,
      space: spaceId,
      customer: customerId,
      notes,
      start,
      end,
      status: 'pending',
      source: 'operator',
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

export interface CreateBlockInput {
  tenantId: string;
  professionalId: string;
  start: Date;
  end: Date;
  title: string;
}

// Bloqueio nasce e permanece `status:'confirmed'` (design.md Data Models) —
// disputa o mesmo índice único que agendamento ativo, então um agendamento
// no `start` exato do bloqueio falha pelo próprio índice (T8 Done when),
// além da checagem de sobreposição aqui para o caso desalinhado.
export const createBlock = async (
  input: CreateBlockInput,
): Promise<AppointmentDocument | AppointmentTransitionError> => {
  const { tenantId, professionalId, start, end, title } = input;

  const professional = await Professional.findOne(tenantScoped({ Tenant: tenantId, _id: professionalId })).lean();
  if (!professional) return INVALID_ERROR;

  const conflict = await hasOverlappingActive(tenantId, professionalId, { start, end });
  if (conflict) return CONFLICT_ERROR;

  try {
    const block = await Appointment.create({
      Tenant: tenantId,
      kind: 'block',
      professional: professionalId,
      title,
      start,
      end,
      status: 'confirmed',
      source: 'operator',
    });

    console.log(JSON.stringify({ event: 'appointment_block_created', tenantId, appointmentId: block._id.toString() }));
    return block;
  } catch (err) {
    if (isDuplicateKeyError(err)) return CONFLICT_ERROR;
    throw err;
  }
};

// Remove só documentos kind='block' do tenant — um id de agendamento (kind
// diferente) ou de outro tenant nunca é removido, apenas reportado como
// not_found (nenhuma pista sobre qual dos dois motivos foi).
export const deleteBlock = async (
  tenantId: string,
  blockId: string,
): Promise<{ deleted: true } | AppointmentTransitionError> => {
  const deleted = await Appointment.findOneAndDelete(
    tenantScoped({ Tenant: tenantId, _id: blockId, kind: 'block' as const }),
  ).lean();
  if (!deleted) return NOT_FOUND_ERROR;

  console.log(JSON.stringify({ event: 'appointment_block_deleted', tenantId, appointmentId: blockId }));
  return { deleted: true };
};

// Cancelamento pelo operador (SCH-32) — símétrico a cancelByToken, mas
// registra QUEM cancelou (canceledBy: userId) e o motivo opcional, e nunca
// aceita token: identificado pelo id, já que quem chama é autenticado.
export const cancelByOperator = async (
  tenantId: string,
  appointmentId: string,
  userId: string,
  reason?: string,
): Promise<AppointmentDocument | AppointmentTransitionError> => {
  const appointment = await Appointment.findOne(tenantScoped({ Tenant: tenantId, _id: appointmentId })).lean();
  if (!appointment) return NOT_FOUND_ERROR;
  if (appointment.status !== 'pending' && appointment.status !== 'confirmed') return TERMINAL_ERROR;

  const updated = await Appointment.findOneAndUpdate(
    tenantScoped({ Tenant: tenantId, _id: appointmentId, status: { $in: ACTIVE_STATUSES } }),
    {
      $set: {
        status: 'canceled_by_operator' as const,
        canceledAt: new Date(),
        canceledBy: userId,
        cancelReason: reason,
      },
    },
    { returnDocument: 'after' },
  ).lean();
  if (!updated) return NOT_FOUND_ERROR;

  console.log(JSON.stringify({ event: 'appointment_canceled', tenantId, appointmentId, canceledBy: 'operator' }));
  return updated;
};

export interface RescheduleAppointmentInput {
  start: Date;
  professionalId?: string;
}

// Remarca o MESMO documento (nunca cria um segundo) — preserva a duração
// ORIGINAL mesmo trocando de profissional (Edge Case do spec.md: mudar a
// duração do profissional não pode reescrever agendamento já marcado).
// Volta a `pending` e limpa `confirmedAt`: a confirmação do cliente valia
// para o horário antigo (spec.md Assumptions, achado na fase Tasks de
// SCH-31). A validade do token acompanha o novo `end` — sem reemitir o
// token em si, só sua janela de validade.
export const rescheduleAppointment = async (
  tenantId: string,
  appointmentId: string,
  input: RescheduleAppointmentInput,
): Promise<AppointmentDocument | AppointmentTransitionError> => {
  const { start, professionalId } = input;

  const appointment = await Appointment.findOne(tenantScoped({ Tenant: tenantId, _id: appointmentId })).lean();
  if (!appointment) return NOT_FOUND_ERROR;
  if (appointment.status !== 'pending' && appointment.status !== 'confirmed') return TERMINAL_ERROR;

  const targetProfessionalId = professionalId ?? appointment.professional.toString();
  const durationMs = appointment.end.getTime() - appointment.start.getTime();
  const end = new Date(start.getTime() + durationMs);

  const conflict = await hasOverlappingActive(tenantId, targetProfessionalId, { start, end }, appointmentId);
  if (conflict) return CONFLICT_ERROR;

  try {
    const updated = await Appointment.findOneAndUpdate(
      tenantScoped({ Tenant: tenantId, _id: appointmentId, status: { $in: ACTIVE_STATUSES } }),
      {
        $set: {
          professional: targetProfessionalId,
          start,
          end,
          status: 'pending' as const,
          confirmationExpiresAt: end,
        },
        $unset: { confirmedAt: '' },
      },
      { returnDocument: 'after' },
    ).lean();
    if (!updated) return NOT_FOUND_ERROR;

    console.log(JSON.stringify({ event: 'appointment_rescheduled', tenantId, appointmentId }));
    return updated;
  } catch (err) {
    if (isDuplicateKeyError(err)) return CONFLICT_ERROR;
    throw err;
  }
};

// Só permitido depois do horário de início (SCH-34) e só a partir de
// pending/confirmed — nunca fecha sozinho o que já está em outro estado.
export const markAttendance = async (
  tenantId: string,
  appointmentId: string,
  userId: string,
  status: 'completed' | 'no_show',
): Promise<AppointmentDocument | AppointmentTransitionError> => {
  const appointment = await Appointment.findOne(tenantScoped({ Tenant: tenantId, _id: appointmentId })).lean();
  if (!appointment) return NOT_FOUND_ERROR;
  if (appointment.status !== 'pending' && appointment.status !== 'confirmed') return TERMINAL_ERROR;
  if (appointment.start.getTime() > Date.now()) return CONFLICT_ERROR;

  const updated = await Appointment.findOneAndUpdate(
    tenantScoped({ Tenant: tenantId, _id: appointmentId, status: { $in: ACTIVE_STATUSES } }),
    { $set: { status, attendanceMarkedAt: new Date(), attendanceMarkedBy: userId } },
    { returnDocument: 'after' },
  ).lean();
  if (!updated) return NOT_FOUND_ERROR;

  console.log(JSON.stringify({ event: 'appointment_attendance', tenantId, appointmentId, status }));
  return updated;
};
