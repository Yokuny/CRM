import crypto from 'node:crypto';
import {
  Appointment,
  Channel,
  Conversation,
  Customer,
  connect,
  dateInDisplayTz,
  disconnect,
  Professional,
  timeInDisplayTz,
  wallClockToUtc,
} from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { bookAppointment } from './bookAppointment.js';
import type { ToolContext } from './toolContext.js';

// Sem `mongoose` aqui (AD-010/boundary) — mesmo padrão de createOrder.int.test.ts.
const randomId = (): string => crypto.randomBytes(12).toString('hex');

const seedConversation = async (tenantId: string) => {
  const channel = await Channel.create({
    Tenant: tenantId,
    phoneNumberId: randomId(),
    accessTokenEnc: { ciphertext: 'c', iv: 'i', authTag: 'a' },
    status: 'active',
  });
  const customer = await Customer.create({
    Tenant: tenantId,
    name: 'Cliente Teste',
    phone: `119${crypto.randomInt(10000000, 99999999)}`,
    template: randomId(),
    templateVersion: 1,
    values: {},
  });
  const conversation = await Conversation.create({
    Tenant: tenantId,
    Channel: channel._id,
    Customer: customer._id,
    mode: 'bot',
    lastActivityAt: new Date(),
  });
  return { channel, customer, conversation };
};

const MINUTES_IN_DAY = 24 * 60;
const FULL_WEEK_WINDOWS = Array.from({ length: 7 }, (_, weekday) => ({ weekday, start: '00:00', end: '23:30' }));

const seedProfessional = (tenantId: string) =>
  Professional.create({
    Tenant: tenantId,
    name: 'Dra. Ana',
    slotDurationMinutes: 30,
    weeklySchedule: FULL_WEEK_WINDOWS,
    active: true,
  });

// Horário alinhado ao grid de 30 em 30 minutos, bem à frente de agora (evita
// qualquer interferência do lead de 60min/horizonte de 90d) — sem mockar o
// relógio, mesma técnica de appointmentTransitions.int.test.ts. Um grid
// 00:00-23:30 nunca tem slot iniciando às 23:30 (terminaria à meia-noite,
// fora da janela — Edge Case do spec.md): se "agora" arredondar exatamente
// pra esse instante do dia, empurra mais um slot pra não cair no único
// horário que o próprio grid exclui por construção.
const farFutureAlignedStart = (): Date => {
  const now = new Date();
  const [hours, minutes] = timeInDisplayTz(now).split(':').map(Number) as [number, number];
  let roundedUp = Math.ceil((hours * 60 + minutes) / 30) * 30;
  if (roundedUp % MINUTES_IN_DAY === MINUTES_IN_DAY - 30) roundedUp += 30;
  const targetMinutes = roundedUp + 3 * MINUTES_IN_DAY;
  const dayShift = Math.floor(targetMinutes / MINUTES_IN_DAY);
  const minutesInDay = targetMinutes % MINUTES_IN_DAY;
  const date = dateInDisplayTz(new Date(now.getTime() + dayShift * 24 * 60 * 60_000));
  const hh = String(Math.floor(minutesInDay / 60)).padStart(2, '0');
  const mm = String(minutesInDay % 60).padStart(2, '0');
  return wallClockToUtc(date, `${hh}:${mm}`);
};

const baseCtx = (tenantId: string, conversationId: string): ToolContext => ({
  tenantId,
  channelId: randomId(),
  conversationId,
  webBaseUrl: 'https://app.example.test',
});

describe('bookAppointment tool (spec.md P1 "Cliente consulta horários e marca pela conversa"/SCH-15..19)', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
  });

  afterEach(async () => {
    await Promise.all([
      Appointment.deleteMany({}),
      Professional.deleteMany({}),
      Conversation.deleteMany({}),
      Customer.deleteMany({}),
      Channel.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await disconnect();
  });

  it('books pending appointment; confirmationUrl starts with ctx.webBaseUrl + apt_ token; date/time in display tz; professionalName present (SCH-15)', async () => {
    const tenantId = randomId();
    const professional = await seedProfessional(tenantId);
    const { conversation } = await seedConversation(tenantId);
    const start = farFutureAlignedStart();

    const result = await bookAppointment(
      { professionalId: professional._id.toString(), start: start.toISOString() },
      baseCtx(tenantId, conversation._id.toString()),
    );

    expect('error' in result).toBe(false);
    if ('error' in result) throw new Error('unreachable');
    expect(result.confirmationUrl).toMatch(/^https:\/\/app\.example\.test\/appointment\?token=apt_[0-9A-Za-z]{32}$/);
    expect(result.professionalName).toBe('Dra. Ana');
    expect(result.status).toBe('pending');
    expect(typeof result.date).toBe('string');
    expect(typeof result.time).toBe('string');

    const saved = await Appointment.findById(result.appointmentId).lean();
    expect(saved?.status).toBe('pending');
    expect(saved?.source).toBe('ai');
  });

  it('returns {error} without ctx.webBaseUrl, and creates zero Appointment', async () => {
    const tenantId = randomId();
    const professional = await seedProfessional(tenantId);
    const { conversation } = await seedConversation(tenantId);
    const start = farFutureAlignedStart();

    const ctx: ToolContext = { tenantId, channelId: randomId(), conversationId: conversation._id.toString() };
    const result = await bookAppointment(
      { professionalId: professional._id.toString(), start: start.toISOString() },
      ctx,
    );

    expect(result).toMatchObject({ error: expect.any(String) });
    await expect(Appointment.countDocuments({})).resolves.toBe(0);
  });

  it('surfaces @crm/db transition errors as {error} without throwing (misaligned start)', async () => {
    const tenantId = randomId();
    const professional = await seedProfessional(tenantId);
    const { conversation } = await seedConversation(tenantId);
    const misaligned = new Date(farFutureAlignedStart().getTime() + 15 * 60_000);

    const result = await bookAppointment(
      { professionalId: professional._id.toString(), start: misaligned.toISOString() },
      baseCtx(tenantId, conversation._id.toString()),
    );

    expect(result).toMatchObject({ error: expect.any(String) });
    await expect(Appointment.countDocuments({})).resolves.toBe(0);
  });

  it('returns {error} when the Conversation belongs to another tenant (defense-in-depth, mirrors create_order)', async () => {
    const ownerTenant = randomId();
    const intruderTenant = randomId();
    const professional = await seedProfessional(ownerTenant);
    const { conversation } = await seedConversation(ownerTenant);
    const start = farFutureAlignedStart();

    const result = await bookAppointment(
      { professionalId: professional._id.toString(), start: start.toISOString() },
      baseCtx(intruderTenant, conversation._id.toString()),
    );

    expect(result).toMatchObject({ error: expect.any(String) });
    await expect(Appointment.countDocuments({})).resolves.toBe(0);
  });

  it('input_schema has no field for tenant, channel, conversation, or customer id', async () => {
    const tenantId = randomId();
    const professional = await seedProfessional(tenantId);
    const { conversation } = await seedConversation(tenantId);
    const start = farFutureAlignedStart();

    // A tipagem de BookAppointmentInput já não expõe esses campos; prova em
    // runtime que passar um customerId "extra" no input não muda de quem o
    // agendamento é atribuído (a Conversation do ctx sempre vence).
    const decoyCustomerId = randomId();
    const result = await bookAppointment(
      {
        professionalId: professional._id.toString(),
        start: start.toISOString(),
        ...({ customerId: decoyCustomerId } as object),
      },
      baseCtx(tenantId, conversation._id.toString()),
    );

    expect('error' in result).toBe(false);
    if ('error' in result) throw new Error('unreachable');
    const saved = await Appointment.findById(result.appointmentId).lean();
    expect(saved?.customer?.toString()).toBe(conversation.Customer.toString());
    expect(saved?.customer?.toString()).not.toBe(decoyCustomerId);
  });
});
