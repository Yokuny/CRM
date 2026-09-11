import mongoose from 'mongoose';
import { describe, expect, it, vi } from 'vitest';
import { useTestDb } from '../tests/helpers/db.helper.js';
import type { AppointmentTransitionError, BookAppointmentSuccess } from './appointmentTransitions.js';
import {
  bookAppointment,
  cancelByToken,
  confirmByToken,
  createBlock,
  createManualAppointment,
  deleteBlock,
  issueConfirmationToken,
} from './appointmentTransitions.js';
import type { AppointmentDocument, AppointmentStatus } from './models/appointment.model.js';
import { Appointment } from './models/appointment.model.js';
import { hashToken } from './models/invite.model.js';
import { Professional } from './models/professional.model.js';
import { Space } from './models/space.model.js';
import { dateInDisplayTz, timeInDisplayTz, wallClockToUtc } from './scheduling.js';

const isError = (result: unknown): result is AppointmentTransitionError =>
  typeof result === 'object' && result !== null && 'error' in result;

// Grade cobrindo os 7 dias da semana, 00:00–23:30, slots de 30min — evita
// qualquer dependência de qual weekday é "hoje" quando a suíte roda de
// verdade (sem mock de relógio: os testes correm contra Mongo real).
const FULL_WEEK_WINDOWS = Array.from({ length: 7 }, (_, weekday) => ({ weekday, start: '00:00', end: '23:30' }));
const MINUTES_IN_DAY = 24 * 60;
// Folga confortável de antecedência/horizonte para os casos "válidos" que
// não testam especificamente o limite de tempo.
const FAR_FUTURE_OFFSET = 3 * MINUTES_IN_DAY;

const seedProfessional = (Tenant: mongoose.Types.ObjectId, overrides: Partial<Record<string, unknown>> = {}) =>
  Professional.create({
    Tenant,
    name: 'Dra. Ana',
    slotDurationMinutes: 30,
    weeklySchedule: FULL_WEEK_WINDOWS,
    active: true,
    ...overrides,
  });

const seedSpace = (Tenant: mongoose.Types.ObjectId, overrides: Partial<Record<string, unknown>> = {}) =>
  Space.create({ Tenant, name: 'Sala 1', active: true, ...overrides });

// Horário alinhado ao grid de 30 em 30 minutos, deslocado `offsetMinutes` a
// partir de "agora" (arredondado para cima ao próximo múltiplo de 30) — sem
// mockar o relógio do sistema, já que a suíte roda contra um Mongo real e
// bookAppointment usa `new Date()` internamente. offsetMinutes não múltiplo
// de 30 produz deliberadamente um horário DESALINHADO ao grid de teste.
const alignedRelativeStart = (offsetMinutes: number): Date => {
  const now = new Date();
  const [hours, minutes] = timeInDisplayTz(now).split(':').map(Number) as [number, number];
  const roundedUp = Math.ceil((hours * 60 + minutes) / 30) * 30;
  const targetMinutes = roundedUp + offsetMinutes;
  const dayShift = Math.floor(targetMinutes / MINUTES_IN_DAY);
  const minutesInDay = ((targetMinutes % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
  const targetDate = dateInDisplayTz(new Date(now.getTime() + dayShift * 24 * 60 * 60_000));
  const hh = String(Math.floor(minutesInDay / 60)).padStart(2, '0');
  const mm = String(minutesInDay % 60).padStart(2, '0');
  return wallClockToUtc(targetDate, `${hh}:${mm}`);
};

// Cria um Appointment diretamente (sem passar por bookAppointment) para
// exercitar confirmByToken/cancelByToken num estado arbitrário (ex.: token
// já expirado, status terminal) sem depender da janela de validação de
// bookAppointment.
const seedAppointmentDirect = (
  Tenant: mongoose.Types.ObjectId,
  overrides: Partial<Record<string, unknown>> = {},
): Promise<AppointmentDocument> =>
  Appointment.create({
    Tenant,
    kind: 'appointment',
    professional: new mongoose.Types.ObjectId(),
    customer: new mongoose.Types.ObjectId(),
    start: alignedRelativeStart(FAR_FUTURE_OFFSET),
    end: alignedRelativeStart(FAR_FUTURE_OFFSET + 30),
    status: 'pending' as AppointmentStatus,
    source: 'ai' as const,
    ...overrides,
  });

describe('appointmentTransitions — bookAppointment (SCH-15..18, SCH-20, SCH-24, SCH-36)', () => {
  useTestDb();

  it('caminho feliz: pending, end=start+slotDurationMinutes, source gravado, token apt_+32 base62 só no retorno, confirmationExpiresAt===end', async () => {
    const Tenant = new mongoose.Types.ObjectId();
    const professional = await seedProfessional(Tenant);
    const start = alignedRelativeStart(FAR_FUTURE_OFFSET);

    const result = await bookAppointment({
      tenantId: Tenant.toString(),
      professionalId: professional._id.toString(),
      start,
      customerId: new mongoose.Types.ObjectId().toString(),
      source: 'ai',
    });

    expect(isError(result)).toBe(false);
    const { appointment, confirmationToken } = result as BookAppointmentSuccess;
    expect(appointment.status).toBe('pending');
    expect(appointment.end.getTime()).toBe(start.getTime() + 30 * 60_000);
    expect(appointment.source).toBe('ai');
    expect(confirmationToken).toMatch(/^apt_[0-9A-Za-z]{32}$/);
    expect(appointment.confirmationExpiresAt?.getTime()).toBe(appointment.end.getTime());

    // O documento persistido nunca contém o token em claro — só o hash.
    const reloaded = await Appointment.findById(appointment._id).lean();
    expect(reloaded?.confirmationTokenHash).toBeDefined();
    expect(JSON.stringify(reloaded)).not.toContain(confirmationToken);
  });

  describe('rejeita sem criar nada (SCH-16)', () => {
    it('start desalinhado ao grid', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const professional = await seedProfessional(Tenant);
      const start = alignedRelativeStart(FAR_FUTURE_OFFSET + 15);

      const result = await bookAppointment({
        tenantId: Tenant.toString(),
        professionalId: professional._id.toString(),
        start,
        customerId: new mongoose.Types.ObjectId().toString(),
        source: 'ai',
      });

      expect(result).toMatchObject({ code: 'invalid' });
      await expect(Appointment.countDocuments({})).resolves.toBe(0);
    });

    it('start no passado', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const professional = await seedProfessional(Tenant);
      const start = alignedRelativeStart(-MINUTES_IN_DAY);

      const result = await bookAppointment({
        tenantId: Tenant.toString(),
        professionalId: professional._id.toString(),
        start,
        customerId: new mongoose.Types.ObjectId().toString(),
        source: 'ai',
      });

      expect(result).toMatchObject({ code: 'invalid' });
      await expect(Appointment.countDocuments({})).resolves.toBe(0);
    });

    it('start a menos de 60min de agora', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const professional = await seedProfessional(Tenant);
      const start = alignedRelativeStart(30);

      const result = await bookAppointment({
        tenantId: Tenant.toString(),
        professionalId: professional._id.toString(),
        start,
        customerId: new mongoose.Types.ObjectId().toString(),
        source: 'ai',
      });

      expect(result).toMatchObject({ code: 'invalid' });
      await expect(Appointment.countDocuments({})).resolves.toBe(0);
    });

    it('start além de 90 dias', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const professional = await seedProfessional(Tenant);
      const start = alignedRelativeStart(91 * MINUTES_IN_DAY);

      const result = await bookAppointment({
        tenantId: Tenant.toString(),
        professionalId: professional._id.toString(),
        start,
        customerId: new mongoose.Types.ObjectId().toString(),
        source: 'ai',
      });

      expect(result).toMatchObject({ code: 'invalid' });
      await expect(Appointment.countDocuments({})).resolves.toBe(0);
    });

    it('profissional inativo', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const professional = await seedProfessional(Tenant, { active: false });
      const start = alignedRelativeStart(FAR_FUTURE_OFFSET);

      const result = await bookAppointment({
        tenantId: Tenant.toString(),
        professionalId: professional._id.toString(),
        start,
        customerId: new mongoose.Types.ObjectId().toString(),
        source: 'ai',
      });

      expect(result).toMatchObject({ code: 'invalid' });
      await expect(Appointment.countDocuments({})).resolves.toBe(0);
    });

    it('profissional de outro tenant', async () => {
      const ownerTenant = new mongoose.Types.ObjectId();
      const intruderTenant = new mongoose.Types.ObjectId();
      const professional = await seedProfessional(ownerTenant);
      const start = alignedRelativeStart(FAR_FUTURE_OFFSET);

      const result = await bookAppointment({
        tenantId: intruderTenant.toString(),
        professionalId: professional._id.toString(),
        start,
        customerId: new mongoose.Types.ObjectId().toString(),
        source: 'ai',
      });

      expect(result).toMatchObject({ code: 'invalid' });
      await expect(Appointment.countDocuments({})).resolves.toBe(0);
    });

    it('spaceId de outro tenant', async () => {
      const ownerTenant = new mongoose.Types.ObjectId();
      const intruderTenant = new mongoose.Types.ObjectId();
      const professional = await seedProfessional(ownerTenant);
      const foreignSpace = await seedSpace(intruderTenant);
      const start = alignedRelativeStart(FAR_FUTURE_OFFSET);

      const result = await bookAppointment({
        tenantId: ownerTenant.toString(),
        professionalId: professional._id.toString(),
        spaceId: foreignSpace._id.toString(),
        start,
        customerId: new mongoose.Types.ObjectId().toString(),
        source: 'ai',
      });

      expect(result).toMatchObject({ code: 'invalid' });
      await expect(Appointment.countDocuments({})).resolves.toBe(0);
    });
  });

  describe('1 agendamento futuro ativo por cliente (SCH-18)', () => {
    it('cliente já com agendamento futuro ativo → conflict, sem criar um 2º', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const professionalA = await seedProfessional(Tenant);
      const professionalB = await seedProfessional(Tenant);
      const customerId = new mongoose.Types.ObjectId().toString();
      const firstStart = alignedRelativeStart(FAR_FUTURE_OFFSET);
      const secondStart = alignedRelativeStart(FAR_FUTURE_OFFSET + 4 * MINUTES_IN_DAY);

      const first = await bookAppointment({
        tenantId: Tenant.toString(),
        professionalId: professionalA._id.toString(),
        start: firstStart,
        customerId,
        source: 'ai',
      });
      expect(isError(first)).toBe(false);

      const second = await bookAppointment({
        tenantId: Tenant.toString(),
        professionalId: professionalB._id.toString(),
        start: secondStart,
        customerId,
        source: 'ai',
      });

      expect(second).toMatchObject({ code: 'conflict' });
      await expect(Appointment.countDocuments({ Tenant, customer: customerId })).resolves.toBe(1);
    });

    it('retry exato (mesmo profissional e start, ainda ativo) devolve o existente — count segue 1', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const professional = await seedProfessional(Tenant);
      const customerId = new mongoose.Types.ObjectId().toString();
      const start = alignedRelativeStart(FAR_FUTURE_OFFSET);

      const first = await bookAppointment({
        tenantId: Tenant.toString(),
        professionalId: professional._id.toString(),
        start,
        customerId,
        source: 'ai',
      });
      expect(isError(first)).toBe(false);
      const firstAppointment = (first as BookAppointmentSuccess).appointment;

      const retry = await bookAppointment({
        tenantId: Tenant.toString(),
        professionalId: professional._id.toString(),
        start,
        customerId,
        source: 'ai',
      });

      expect(isError(retry)).toBe(false);
      const { appointment, confirmationToken } = retry as BookAppointmentSuccess;
      expect(appointment._id.toString()).toBe(firstAppointment._id.toString());
      expect(confirmationToken).toMatch(/^apt_[0-9A-Za-z]{32}$/);
      await expect(
        Appointment.countDocuments({ Tenant, customer: customerId, professional: professional._id, start }),
      ).resolves.toBe(1);
    });
  });

  it('corrida genuína (Promise.all): 5 clientes disputando o mesmo (professional,start) → exatamente 1 ativo, 4 error (SCH-20)', async () => {
    const Tenant = new mongoose.Types.ObjectId();
    const professional = await seedProfessional(Tenant);
    const start = alignedRelativeStart(FAR_FUTURE_OFFSET);
    const customerIds = Array.from({ length: 5 }, () => new mongoose.Types.ObjectId().toString());

    const results = await Promise.all(
      customerIds.map((customerId) =>
        bookAppointment({
          tenantId: Tenant.toString(),
          professionalId: professional._id.toString(),
          start,
          customerId,
          source: 'ai',
        }),
      ),
    );

    const successes = results.filter((result) => !isError(result));
    const failures = results.filter((result): result is AppointmentTransitionError => isError(result));
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(4);
    for (const failure of failures) {
      expect(failure.code).toBe('conflict');
    }
    await expect(
      Appointment.countDocuments({
        Tenant,
        professional: professional._id,
        start,
        status: { $in: ['pending', 'confirmed'] },
      }),
    ).resolves.toBe(1);
  });

  describe('observabilidade (SCH-36)', () => {
    it('emite {event:"appointment_booked"} no sucesso', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const Tenant = new mongoose.Types.ObjectId();
      const professional = await seedProfessional(Tenant);
      const start = alignedRelativeStart(FAR_FUTURE_OFFSET);

      await bookAppointment({
        tenantId: Tenant.toString(),
        professionalId: professional._id.toString(),
        start,
        customerId: new mongoose.Types.ObjectId().toString(),
        source: 'ai',
      });

      const loggedEvents = logSpy.mock.calls.map(([arg]) => JSON.parse(arg as string));
      expect(loggedEvents).toContainEqual(expect.objectContaining({ event: 'appointment_booked' }));
      logSpy.mockRestore();
    });
  });
});

describe('appointmentTransitions — issueConfirmationToken (SCH-24)', () => {
  useTestDb();

  it('gera token novo diferente do anterior; hash antigo deixa de resolver; validade = end', async () => {
    const Tenant = new mongoose.Types.ObjectId();
    const professional = await seedProfessional(Tenant);
    const start = alignedRelativeStart(FAR_FUTURE_OFFSET);
    const booked = await bookAppointment({
      tenantId: Tenant.toString(),
      professionalId: professional._id.toString(),
      start,
      customerId: new mongoose.Types.ObjectId().toString(),
      source: 'ai',
    });
    const { appointment, confirmationToken: oldToken } = booked as BookAppointmentSuccess;
    const oldHash = appointment.confirmationTokenHash;

    const reissued = await issueConfirmationToken(Tenant.toString(), appointment._id.toString());

    expect(isError(reissued)).toBe(false);
    const { confirmationToken: newToken } = reissued as { confirmationToken: string };
    expect(newToken).not.toBe(oldToken);

    const foundByOldHash = await Appointment.findOne({ confirmationTokenHash: oldHash }).lean();
    expect(foundByOldHash).toBeNull();

    const reloaded = await Appointment.findById(appointment._id).lean();
    expect(reloaded?.confirmationExpiresAt?.getTime()).toBe(reloaded?.end.getTime());
  });

  it('retorna {error, code:not_found} para appointment inexistente ou de outro tenant', async () => {
    const Tenant = new mongoose.Types.ObjectId();
    const intruderTenant = new mongoose.Types.ObjectId();
    const professional = await seedProfessional(Tenant);
    const start = alignedRelativeStart(FAR_FUTURE_OFFSET);
    const booked = await bookAppointment({
      tenantId: Tenant.toString(),
      professionalId: professional._id.toString(),
      start,
      customerId: new mongoose.Types.ObjectId().toString(),
      source: 'ai',
    });
    const { appointment } = booked as BookAppointmentSuccess;

    const notFound = await issueConfirmationToken(Tenant.toString(), new mongoose.Types.ObjectId().toString());
    expect(notFound).toMatchObject({ code: 'not_found' });

    const wrongTenant = await issueConfirmationToken(intruderTenant.toString(), appointment._id.toString());
    expect(wrongTenant).toMatchObject({ code: 'not_found' });
  });
});

describe('appointmentTransitions — confirmByToken / cancelByToken (SCH-23, SCH-25, SCH-26, SCH-27, SCH-36)', () => {
  useTestDb();

  it('nenhuma das duas funções aceita id de agendamento — assinatura é (tokenHash) apenas', () => {
    expect(confirmByToken.length).toBe(1);
    expect(cancelByToken.length).toBe(1);
  });

  describe('confirmByToken', () => {
    it('pending -> confirmed com confirmedAt', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const token = 'plain-token-1';
      await seedAppointmentDirect(Tenant, { confirmationTokenHash: hashToken(token) });

      const result = await confirmByToken(hashToken(token));

      expect(isError(result)).toBe(false);
      const confirmed = result as AppointmentDocument;
      expect(confirmed.status).toBe('confirmed');
      expect(confirmed.confirmedAt).toBeInstanceOf(Date);
    });

    it('repetir sobre já confirmado responde o mesmo estado sem erro (SCH-25)', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const token = 'plain-token-2';
      await seedAppointmentDirect(Tenant, { confirmationTokenHash: hashToken(token) });

      const first = await confirmByToken(hashToken(token));
      const second = await confirmByToken(hashToken(token));

      expect(isError(first)).toBe(false);
      expect(isError(second)).toBe(false);
      expect((second as AppointmentDocument).status).toBe('confirmed');
    });

    it('hash inexistente -> not_found', async () => {
      const result = await confirmByToken(hashToken('never-issued'));
      expect(result).toMatchObject({ code: 'not_found' });
    });

    it('token expirado -> expired', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const token = 'plain-token-expired';
      await seedAppointmentDirect(Tenant, {
        confirmationTokenHash: hashToken(token),
        confirmationExpiresAt: new Date(Date.now() - 60_000),
      });

      const result = await confirmByToken(hashToken(token));
      expect(result).toMatchObject({ code: 'expired' });
    });

    it('ação sobre agendamento já terminal -> terminal, documento intacto', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const token = 'plain-token-terminal';
      const seeded = await seedAppointmentDirect(Tenant, {
        confirmationTokenHash: hashToken(token),
        status: 'canceled_by_operator' as AppointmentStatus,
      });

      const result = await confirmByToken(hashToken(token));

      expect(result).toMatchObject({ code: 'terminal' });
      const reloaded = await Appointment.findById(seeded._id).lean();
      expect(reloaded?.status).toBe('canceled_by_operator');
    });

    it('emite {event:"appointment_confirmed"} no sucesso (SCH-36)', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const Tenant = new mongoose.Types.ObjectId();
      const token = 'plain-token-log';
      await seedAppointmentDirect(Tenant, { confirmationTokenHash: hashToken(token) });

      await confirmByToken(hashToken(token));

      const loggedEvents = logSpy.mock.calls.map(([arg]) => JSON.parse(arg as string));
      expect(loggedEvents).toContainEqual(expect.objectContaining({ event: 'appointment_confirmed' }));
      logSpy.mockRestore();
    });
  });

  describe('cancelByToken', () => {
    it('cancela -> canceled_by_customer, e o horário volta a ser reservável (SCH-26)', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const professional = await seedProfessional(Tenant);
      const start = alignedRelativeStart(FAR_FUTURE_OFFSET);
      const booked = await bookAppointment({
        tenantId: Tenant.toString(),
        professionalId: professional._id.toString(),
        start,
        customerId: new mongoose.Types.ObjectId().toString(),
        source: 'ai',
      });
      const { appointment, confirmationToken } = booked as BookAppointmentSuccess;

      const canceled = await cancelByToken(hashToken(confirmationToken));
      expect(isError(canceled)).toBe(false);
      expect((canceled as AppointmentDocument).status).toBe('canceled_by_customer');
      expect(canceled).not.toMatchObject({ _id: undefined });
      expect((canceled as AppointmentDocument)._id.toString()).toBe(appointment._id.toString());

      const rebooked = await bookAppointment({
        tenantId: Tenant.toString(),
        professionalId: professional._id.toString(),
        start,
        customerId: new mongoose.Types.ObjectId().toString(),
        source: 'ai',
      });
      expect(isError(rebooked)).toBe(false);
    });

    it('repetir cancelar sobre já canceled_by_customer responde o mesmo estado sem erro', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const token = 'plain-token-cancel-twice';
      await seedAppointmentDirect(Tenant, { confirmationTokenHash: hashToken(token) });

      const first = await cancelByToken(hashToken(token));
      const second = await cancelByToken(hashToken(token));

      expect(isError(first)).toBe(false);
      expect(isError(second)).toBe(false);
      expect((second as AppointmentDocument).status).toBe('canceled_by_customer');
    });

    it('hash inexistente -> not_found', async () => {
      const result = await cancelByToken(hashToken('never-issued-cancel'));
      expect(result).toMatchObject({ code: 'not_found' });
    });

    it('token expirado -> expired', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const token = 'plain-token-cancel-expired';
      await seedAppointmentDirect(Tenant, {
        confirmationTokenHash: hashToken(token),
        confirmationExpiresAt: new Date(Date.now() - 60_000),
      });

      const result = await cancelByToken(hashToken(token));
      expect(result).toMatchObject({ code: 'expired' });
    });

    it('ação sobre agendamento já terminal -> terminal, documento intacto', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const token = 'plain-token-cancel-terminal';
      const seeded = await seedAppointmentDirect(Tenant, {
        confirmationTokenHash: hashToken(token),
        status: 'completed' as AppointmentStatus,
      });

      const result = await cancelByToken(hashToken(token));

      expect(result).toMatchObject({ code: 'terminal' });
      const reloaded = await Appointment.findById(seeded._id).lean();
      expect(reloaded?.status).toBe('completed');
    });

    it('emite {event:"appointment_canceled", canceledBy:"customer"} no sucesso (SCH-36)', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const Tenant = new mongoose.Types.ObjectId();
      const token = 'plain-token-cancel-log';
      await seedAppointmentDirect(Tenant, { confirmationTokenHash: hashToken(token) });

      await cancelByToken(hashToken(token));

      const loggedEvents = logSpy.mock.calls.map(([arg]) => JSON.parse(arg as string));
      expect(loggedEvents).toContainEqual(
        expect.objectContaining({ event: 'appointment_canceled', canceledBy: 'customer' }),
      );
      logSpy.mockRestore();
    });
  });
});

describe('appointmentTransitions — createManualAppointment / createBlock / deleteBlock (SCH-30, SCH-33, SCH-36)', () => {
  useTestDb();

  describe('createManualAppointment (encaixe do operador)', () => {
    it('aceito fora da grade, além de 90 dias e sem antecedência mínima; source:operator; emite token como bookAppointment', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      // Grade só de segunda 09:00-10:00 — o horário escolhido abaixo (a
      // menos de 60min, e possivelmente fora do grid) prova que o encaixe
      // ignora alinhamento/antecedência/horizonte.
      const professional = await seedProfessional(Tenant, {
        weeklySchedule: [{ weekday: 1, start: '09:00', end: '10:00' }],
      });
      const start = new Date(Date.now() + 5 * 60_000); // 5min de agora — bem abaixo do lead de 60min da IA
      const end = new Date(start.getTime() + 43 * 60_000); // duração arbitrária, fora de qualquer grid de 30/60min

      const result = await createManualAppointment({
        tenantId: Tenant.toString(),
        professionalId: professional._id.toString(),
        start,
        end,
        customerId: new mongoose.Types.ObjectId().toString(),
      });

      expect(isError(result)).toBe(false);
      const { appointment, confirmationToken } = result as BookAppointmentSuccess;
      expect(appointment.source).toBe('operator');
      expect(appointment.status).toBe('pending');
      expect(appointment.start.getTime()).toBe(start.getTime());
      expect(appointment.end.getTime()).toBe(end.getTime());
      expect(confirmationToken).toMatch(/^apt_[0-9A-Za-z]{32}$/);

      // Além de 90 dias — outro encaixe, mesma prova de ausência de teto de horizonte.
      const farStart = new Date(Date.now() + 200 * MINUTES_IN_DAY * 60_000);
      const farEnd = new Date(farStart.getTime() + 30 * 60_000);
      const farResult = await createManualAppointment({
        tenantId: Tenant.toString(),
        professionalId: professional._id.toString(),
        start: farStart,
        end: farEnd,
        customerId: new mongoose.Types.ObjectId().toString(),
      });
      expect(isError(farResult)).toBe(false);
    });

    it('sobreposição com agendamento ativo do mesmo profissional rejeitada, inclusive desalinhada (09:15-09:45 vs 09:00-10:00)', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const professional = await seedProfessional(Tenant);
      const baseDate = dateInDisplayTz(alignedRelativeStart(FAR_FUTURE_OFFSET));
      const existingStart = wallClockToUtc(baseDate, '09:00');
      const existingEnd = wallClockToUtc(baseDate, '10:00');

      await createManualAppointment({
        tenantId: Tenant.toString(),
        professionalId: professional._id.toString(),
        start: existingStart,
        end: existingEnd,
        customerId: new mongoose.Types.ObjectId().toString(),
      });

      const overlappingStart = wallClockToUtc(baseDate, '09:15');
      const overlappingEnd = wallClockToUtc(baseDate, '09:45');
      const result = await createManualAppointment({
        tenantId: Tenant.toString(),
        professionalId: professional._id.toString(),
        start: overlappingStart,
        end: overlappingEnd,
        customerId: new mongoose.Types.ObjectId().toString(),
      });

      expect(result).toMatchObject({ code: 'conflict' });
      await expect(Appointment.countDocuments({ Tenant, professional: professional._id })).resolves.toBe(1);
    });

    it('sobreposição com bloqueio do mesmo profissional rejeitada', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const professional = await seedProfessional(Tenant);
      const baseDate = dateInDisplayTz(alignedRelativeStart(FAR_FUTURE_OFFSET));
      const blockStart = wallClockToUtc(baseDate, '14:00');
      const blockEnd = wallClockToUtc(baseDate, '15:00');

      await createBlock({
        tenantId: Tenant.toString(),
        professionalId: professional._id.toString(),
        start: blockStart,
        end: blockEnd,
        title: 'Almoço',
      });

      const result = await createManualAppointment({
        tenantId: Tenant.toString(),
        professionalId: professional._id.toString(),
        start: wallClockToUtc(baseDate, '14:30'),
        end: wallClockToUtc(baseDate, '15:30'),
        customerId: new mongoose.Types.ObjectId().toString(),
      });

      expect(result).toMatchObject({ code: 'conflict' });
    });

    it('professional de outro tenant -> invalid, sem criar nada (AD-010)', async () => {
      const ownerTenant = new mongoose.Types.ObjectId();
      const intruderTenant = new mongoose.Types.ObjectId();
      const professional = await seedProfessional(ownerTenant);
      const start = alignedRelativeStart(FAR_FUTURE_OFFSET);
      const end = new Date(start.getTime() + 30 * 60_000);

      const result = await createManualAppointment({
        tenantId: intruderTenant.toString(),
        professionalId: professional._id.toString(),
        start,
        end,
        customerId: new mongoose.Types.ObjectId().toString(),
      });

      expect(result).toMatchObject({ code: 'invalid' });
      await expect(Appointment.countDocuments({})).resolves.toBe(0);
    });
  });

  describe('createBlock', () => {
    it('cria kind:block, status:confirmed, sem cliente', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const professional = await seedProfessional(Tenant);
      const start = alignedRelativeStart(FAR_FUTURE_OFFSET);
      const end = new Date(start.getTime() + 60 * 60_000);

      const result = await createBlock({
        tenantId: Tenant.toString(),
        professionalId: professional._id.toString(),
        start,
        end,
        title: 'Feriado',
      });

      expect(isError(result)).toBe(false);
      const block = result as AppointmentDocument;
      expect(block.kind).toBe('block');
      expect(block.status).toBe('confirmed');
      expect(block.customer).toBeUndefined();
      expect(block.title).toBe('Feriado');
    });

    it('sobreposto a agendamento ativo -> conflict', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const professional = await seedProfessional(Tenant);
      const start = alignedRelativeStart(FAR_FUTURE_OFFSET);
      const end = new Date(start.getTime() + 30 * 60_000);

      await bookAppointment({
        tenantId: Tenant.toString(),
        professionalId: professional._id.toString(),
        start,
        customerId: new mongoose.Types.ObjectId().toString(),
        source: 'ai',
      });

      const result = await createBlock({
        tenantId: Tenant.toString(),
        professionalId: professional._id.toString(),
        start,
        end,
        title: 'Bloqueio conflitante',
      });

      expect(result).toMatchObject({ code: 'conflict' });
    });

    it('reserva no start exato do bloqueio falha pelo índice único parcial', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const professional = await seedProfessional(Tenant);
      const start = alignedRelativeStart(FAR_FUTURE_OFFSET);
      const end = new Date(start.getTime() + 30 * 60_000);

      const block = await createBlock({
        tenantId: Tenant.toString(),
        professionalId: professional._id.toString(),
        start,
        end,
        title: 'Reunião',
      });
      expect(isError(block)).toBe(false);

      const result = await bookAppointment({
        tenantId: Tenant.toString(),
        professionalId: professional._id.toString(),
        start,
        customerId: new mongoose.Types.ObjectId().toString(),
        source: 'ai',
      });

      expect(result).toMatchObject({ code: 'conflict' });
    });
  });

  describe('deleteBlock', () => {
    it('remove só kind:block do tenant', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const professional = await seedProfessional(Tenant);
      const start = alignedRelativeStart(FAR_FUTURE_OFFSET);
      const end = new Date(start.getTime() + 30 * 60_000);

      const block = (await createBlock({
        tenantId: Tenant.toString(),
        professionalId: professional._id.toString(),
        start,
        end,
        title: 'Remover depois',
      })) as AppointmentDocument;

      const result = await deleteBlock(Tenant.toString(), block._id.toString());

      expect(result).toEqual({ deleted: true });
      await expect(Appointment.findById(block._id).lean()).resolves.toBeNull();
    });

    it('id de agendamento (kind diferente) -> not_found, nada removido', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const professional = await seedProfessional(Tenant);
      const booked = (await bookAppointment({
        tenantId: Tenant.toString(),
        professionalId: professional._id.toString(),
        start: alignedRelativeStart(FAR_FUTURE_OFFSET),
        customerId: new mongoose.Types.ObjectId().toString(),
        source: 'ai',
      })) as BookAppointmentSuccess;

      const result = await deleteBlock(Tenant.toString(), booked.appointment._id.toString());

      expect(result).toMatchObject({ code: 'not_found' });
      await expect(Appointment.findById(booked.appointment._id).lean()).resolves.not.toBeNull();
    });

    it('id de bloqueio de outro tenant -> not_found', async () => {
      const ownerTenant = new mongoose.Types.ObjectId();
      const intruderTenant = new mongoose.Types.ObjectId();
      const professional = await seedProfessional(ownerTenant);
      const start = alignedRelativeStart(FAR_FUTURE_OFFSET);
      const end = new Date(start.getTime() + 30 * 60_000);

      const block = (await createBlock({
        tenantId: ownerTenant.toString(),
        professionalId: professional._id.toString(),
        start,
        end,
        title: 'Bloqueio do dono',
      })) as AppointmentDocument;

      const result = await deleteBlock(intruderTenant.toString(), block._id.toString());

      expect(result).toMatchObject({ code: 'not_found' });
      await expect(Appointment.findById(block._id).lean()).resolves.not.toBeNull();
    });
  });
});
