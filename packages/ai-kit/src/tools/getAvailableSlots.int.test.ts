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
  SchedulingSettings,
  timeInDisplayTz,
  wallClockToUtc,
  weekdayInDisplayTz,
} from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getAvailableSlots } from './getAvailableSlots.js';
import type { ToolContext } from './toolContext.js';

// Sem `mongoose` aqui (AD-010/boundary) — mesmo padrão de createOrder.int.test.ts.
const randomId = (): string => crypto.randomBytes(12).toString('hex');

// Channel tem índice único por Tenant (um número de WhatsApp por tenant) —
// uma 2ª Conversation do MESMO tenant (decoy de outro cliente) reusa o
// Channel já criado em vez de tentar criar um segundo.
const seedConversationOnChannel = async (tenantId: string, channelId: string) => {
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
    Channel: channelId,
    Customer: customer._id,
    mode: 'bot',
    lastActivityAt: new Date(),
  });
  return { customer, conversation };
};

const seedConversation = async (tenantId: string) => {
  const channel = await Channel.create({
    Tenant: tenantId,
    phoneNumberId: randomId(),
    accessTokenEnc: { ciphertext: 'c', iv: 'i', authTag: 'a' },
    status: 'active',
  });
  const { customer, conversation } = await seedConversationOnChannel(tenantId, channel._id.toString());
  return { channel, customer, conversation };
};

const baseCtx = (tenantId: string, conversationId: string): ToolContext => ({
  tenantId,
  channelId: randomId(),
  conversationId,
});

// 'YYYY-MM-DD' na hora de exibição, deslocado `days` dias reais a partir de
// agora — nunca hoje mesmo (evita qualquer interferência do lead de 60min com
// o horário exato em que a suíte roda).
const displayDateOffsetByDays = (days: number): string =>
  dateInDisplayTz(new Date(Date.now() + days * 24 * 60 * 60 * 1000));

const MINUTES_IN_DAY = 24 * 60;
// Grade cobrindo os 7 dias da semana, 00:00–23:30, slots de 30min — evita
// qualquer dependência de qual weekday é "hoje" quando a suíte roda de
// verdade (mesmo padrão de appointmentTransitions.int.test.ts).
const FULL_WEEK_WINDOWS = Array.from({ length: 7 }, (_, weekday) => ({ weekday, start: '00:00', end: '23:30' }));

// Horário alinhado ao grid de 30 em 30 minutos, `offsetMinutes` à frente do
// próximo múltiplo de 30 a partir de "agora" — sem mockar o relógio (a suíte
// roda contra Mongo real). offsetMinutes=30 sempre cai a 30-60min de "agora"
// (dentro do lead de 60min, SCH-11); offsetMinutes=90 sempre cai a 90-120min
// (fora do lead).
const alignedRelativeStart = (offsetMinutes: number): { date: string; instant: Date } => {
  const now = new Date();
  const [hours, minutes] = timeInDisplayTz(now).split(':').map(Number) as [number, number];
  const roundedUp = Math.ceil((hours * 60 + minutes) / 30) * 30;
  const targetMinutes = roundedUp + offsetMinutes;
  const dayShift = Math.floor(targetMinutes / MINUTES_IN_DAY);
  const minutesInDay = ((targetMinutes % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
  const date = dateInDisplayTz(new Date(now.getTime() + dayShift * 24 * 60 * 60_000));
  const hh = String(Math.floor(minutesInDay / 60)).padStart(2, '0');
  const mm = String(minutesInDay % 60).padStart(2, '0');
  return { date, instant: wallClockToUtc(date, `${hh}:${mm}`) };
};

describe('getAvailableSlots tool (spec.md P1 "Cliente consulta horários e marca pela conversa"/SCH-09..14)', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
  });

  afterEach(async () => {
    await Promise.all([
      Appointment.deleteMany({}),
      Professional.deleteMany({}),
      SchedulingSettings.deleteMany({}),
      Conversation.deleteMany({}),
      Customer.deleteMany({}),
      Channel.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await disconnect();
  });

  it('returns real slots with start (ISO UTC) + time (display-tz) + free professionals; an active appointment removes the slot only for its own professional, a block removes it only for its own professional (SCH-09)', async () => {
    const tenant = randomId();
    const { conversation } = await seedConversation(tenant);
    const targetDate = displayDateOffsetByDays(1);
    const weekday = weekdayInDisplayTz(targetDate);
    const window = [{ weekday, start: '10:00', end: '11:00' }];
    const profA = await Professional.create({
      Tenant: tenant,
      name: 'Dra. Ana',
      slotDurationMinutes: 30,
      weeklySchedule: window,
      active: true,
    });
    const profB = await Professional.create({
      Tenant: tenant,
      name: 'Dr. Bruno',
      slotDurationMinutes: 30,
      weeklySchedule: window,
      active: true,
    });
    // Agendamento ativo ocupa profA só em 10:00-10:30; bloqueio ocupa profB só
    // em 10:30-11:00 — os dois `kind` cobertos, cada um restrito ao seu
    // próprio profissional.
    await Appointment.create({
      Tenant: tenant,
      kind: 'appointment',
      professional: profA._id,
      customer: randomId(),
      start: wallClockToUtc(targetDate, '10:00'),
      end: wallClockToUtc(targetDate, '10:30'),
      status: 'pending',
      source: 'ai',
    });
    await Appointment.create({
      Tenant: tenant,
      kind: 'block',
      professional: profB._id,
      title: 'Bloqueio',
      start: wallClockToUtc(targetDate, '10:30'),
      end: wallClockToUtc(targetDate, '11:00'),
      status: 'confirmed',
      source: 'operator',
    });

    const result = await getAvailableSlots({ date: targetDate }, baseCtx(tenant, conversation._id.toString()));

    expect('error' in result).toBe(false);
    if ('error' in result) throw new Error('unreachable');
    expect(result.date).toBe(targetDate);
    expect(result.slots).toHaveLength(2);
    const slot1000 = result.slots.find((s) => s.time === '10:00');
    const slot1030 = result.slots.find((s) => s.time === '10:30');
    expect(slot1000?.start).toBe(wallClockToUtc(targetDate, '10:00').toISOString());
    expect(slot1000?.professionals).toEqual([{ id: profB._id.toString(), name: 'Dr. Bruno' }]);
    expect(slot1030?.start).toBe(wallClockToUtc(targetDate, '10:30').toISOString());
    expect(slot1030?.professionals).toEqual([{ id: profA._id.toString(), name: 'Dra. Ana' }]);
  });

  it('omits a slot that begins less than 1 hour from now, even though it is free in the grid (SCH-11)', async () => {
    const tenant = randomId();
    const { conversation } = await seedConversation(tenant);
    const professional = await Professional.create({
      Tenant: tenant,
      name: 'Dra. Ana',
      slotDurationMinutes: 30,
      weeklySchedule: FULL_WEEK_WINDOWS,
      active: true,
    });
    const ctx = baseCtx(tenant, conversation._id.toString());
    const near = alignedRelativeStart(30); // 30-60min à frente: dentro do lead de 60min
    const far = alignedRelativeStart(90); // 90-120min à frente: fora do lead

    const nearResult = await getAvailableSlots({ date: near.date, professionalId: professional._id.toString() }, ctx);
    const farResult = await getAvailableSlots({ date: far.date, professionalId: professional._id.toString() }, ctx);

    expect('error' in nearResult).toBe(false);
    expect('error' in farResult).toBe(false);
    if ('error' in nearResult || 'error' in farResult) throw new Error('unreachable');
    expect(nearResult.slots.some((s) => s.start === near.instant.toISOString())).toBe(false);
    expect(farResult.slots.some((s) => s.start === far.instant.toISOString())).toBe(true);
  });

  it('returns {error} for a malformed date, a past date, and a date more than 90 days ahead — without querying anything (SCH-10)', async () => {
    const tenant = randomId();
    const { conversation } = await seedConversation(tenant);
    const ctx = baseCtx(tenant, conversation._id.toString());

    const malformed = await getAvailableSlots({ date: '12/09/2026' }, ctx);
    const past = await getAvailableSlots({ date: displayDateOffsetByDays(-1) }, ctx);
    const beyondHorizon = await getAvailableSlots({ date: displayDateOffsetByDays(91) }, ctx);

    expect(malformed).toEqual({ error: expect.any(String) });
    expect(past).toEqual({ error: expect.any(String) });
    expect(beyondHorizon).toEqual({ error: expect.any(String) });
  });

  it('returns {date, slots: [], upcomingAppointments: []} — never {error} — for a date with no grid coverage that day (SCH-13)', async () => {
    const tenant = randomId();
    const { conversation } = await seedConversation(tenant);
    const targetDate = displayDateOffsetByDays(1);
    const weekday = weekdayInDisplayTz(targetDate);
    const otherWeekday = (weekday + 1) % 7;
    await Professional.create({
      Tenant: tenant,
      name: 'Dra. Ana',
      slotDurationMinutes: 30,
      weeklySchedule: [{ weekday: otherWeekday, start: '10:00', end: '11:00' }],
      active: true,
    });

    const result = await getAvailableSlots({ date: targetDate }, baseCtx(tenant, conversation._id.toString()));

    expect(result).toEqual({ date: targetDate, slots: [], upcomingAppointments: [] });
  });

  it('returns {date, slots: [], upcomingAppointments: []} — never {error} — for a tenant with zero active Professionals (spec.md Edge Cases)', async () => {
    const tenant = randomId();
    const { conversation } = await seedConversation(tenant);
    const targetDate = displayDateOffsetByDays(1);
    const weekday = weekdayInDisplayTz(targetDate);
    // Único profissional do tenant está INATIVO — equivalente a "zero ativos".
    await Professional.create({
      Tenant: tenant,
      name: 'Inativa',
      slotDurationMinutes: 30,
      weeklySchedule: [{ weekday, start: '10:00', end: '11:00' }],
      active: false,
    });

    const result = await getAvailableSlots({ date: targetDate }, baseCtx(tenant, conversation._id.toString()));

    expect(result).toEqual({ date: targetDate, slots: [], upcomingAppointments: [] });
  });

  it('professionalId filters to just that professional; nonexistent, inactive, or foreign-tenant professionalId returns {error} (SCH-12)', async () => {
    const tenant = randomId();
    const otherTenant = randomId();
    const { conversation } = await seedConversation(tenant);
    const targetDate = displayDateOffsetByDays(1);
    const weekday = weekdayInDisplayTz(targetDate);
    const window = [{ weekday, start: '10:00', end: '10:30' }];
    const profA = await Professional.create({
      Tenant: tenant,
      name: 'Dra. Ana',
      slotDurationMinutes: 30,
      weeklySchedule: window,
      active: true,
    });
    await Professional.create({
      Tenant: tenant,
      name: 'Dr. Bruno',
      slotDurationMinutes: 30,
      weeklySchedule: window,
      active: true,
    });
    const inactive = await Professional.create({
      Tenant: tenant,
      name: 'Inativa',
      slotDurationMinutes: 30,
      weeklySchedule: window,
      active: false,
    });
    const foreign = await Professional.create({
      Tenant: otherTenant,
      name: 'De Outro Tenant',
      slotDurationMinutes: 30,
      weeklySchedule: window,
      active: true,
    });
    const ctx = baseCtx(tenant, conversation._id.toString());

    const filtered = await getAvailableSlots({ date: targetDate, professionalId: profA._id.toString() }, ctx);
    const nonexistent = await getAvailableSlots({ date: targetDate, professionalId: randomId() }, ctx);
    const inactiveResult = await getAvailableSlots({ date: targetDate, professionalId: inactive._id.toString() }, ctx);
    const foreignResult = await getAvailableSlots({ date: targetDate, professionalId: foreign._id.toString() }, ctx);

    expect('error' in filtered).toBe(false);
    if ('error' in filtered) throw new Error('unreachable');
    expect(filtered.slots).toHaveLength(1);
    expect(filtered.slots[0]?.professionals).toEqual([{ id: profA._id.toString(), name: 'Dra. Ana' }]);
    expect(nonexistent).toEqual({ error: expect.any(String) });
    expect(inactiveResult).toEqual({ error: expect.any(String) });
    expect(foreignResult).toEqual({ error: expect.any(String) });
  });

  it('caps the number of slots at SchedulingSettings.maxSlotsPerResponse when configured, and at DEFAULT_MAX_SLOTS (16) otherwise', async () => {
    const tenant = randomId();
    const { conversation } = await seedConversation(tenant);
    const targetDate = displayDateOffsetByDays(1);
    const weekday = weekdayInDisplayTz(targetDate);
    // 00:00-23:30 de 30 em 30min: 47 slots possíveis num único profissional.
    await Professional.create({
      Tenant: tenant,
      name: 'Dra. Ana',
      slotDurationMinutes: 30,
      weeklySchedule: [{ weekday, start: '00:00', end: '23:30' }],
      active: true,
    });
    const ctx = baseCtx(tenant, conversation._id.toString());

    const withoutSettings = await getAvailableSlots({ date: targetDate }, ctx);
    await SchedulingSettings.create({ Tenant: tenant, maxSlotsPerResponse: 3 });
    const withSettings = await getAvailableSlots({ date: targetDate }, ctx);

    expect('error' in withoutSettings).toBe(false);
    expect('error' in withSettings).toBe(false);
    if ('error' in withoutSettings || 'error' in withSettings) throw new Error('unreachable');
    expect(withoutSettings.slots).toHaveLength(16);
    expect(withSettings.slots).toHaveLength(3);
  });

  it("upcomingAppointments contains only this conversation's own Customer's active future appointments — never another customer's or another tenant's", async () => {
    const tenant = randomId();
    const otherTenant = randomId();
    const { channel, conversation, customer } = await seedConversation(tenant);
    const { conversation: decoyConversation } = await seedConversationOnChannel(tenant, channel._id.toString());
    const { conversation: foreignConversation } = await seedConversation(otherTenant);
    const targetDate = displayDateOffsetByDays(1);
    const weekday = weekdayInDisplayTz(targetDate);
    const professional = await Professional.create({
      Tenant: tenant,
      name: 'Dra. Ana',
      slotDurationMinutes: 30,
      weeklySchedule: [{ weekday, start: '10:00', end: '10:30' }],
      active: true,
    });
    const ownFutureStart = wallClockToUtc(targetDate, '10:00');
    await Appointment.create({
      Tenant: tenant,
      kind: 'appointment',
      professional: professional._id,
      customer: customer._id,
      start: ownFutureStart,
      end: wallClockToUtc(targetDate, '10:30'),
      status: 'pending',
      source: 'ai',
    });
    // Decoy: mesmo tenant, cliente DIFERENTE (outra Conversation) — horário
    // DIFERENTE do "own" acima (mesmo profissional+start colidiria com o
    // índice único parcial de Appointment).
    await Appointment.create({
      Tenant: tenant,
      kind: 'appointment',
      professional: professional._id,
      customer: decoyConversation.Customer,
      start: wallClockToUtc(targetDate, '11:00'),
      end: wallClockToUtc(targetDate, '11:30'),
      status: 'pending',
      source: 'ai',
    });
    // Decoy: outro tenant inteiro.
    const foreignProfessional = await Professional.create({
      Tenant: otherTenant,
      name: 'De Outro Tenant',
      slotDurationMinutes: 30,
      weeklySchedule: [{ weekday, start: '10:00', end: '10:30' }],
      active: true,
    });
    await Appointment.create({
      Tenant: otherTenant,
      kind: 'appointment',
      professional: foreignProfessional._id,
      customer: foreignConversation.Customer,
      start: wallClockToUtc(targetDate, '10:00'),
      end: wallClockToUtc(targetDate, '10:30'),
      status: 'pending',
      source: 'ai',
    });

    const result = await getAvailableSlots(
      { date: targetDate, professionalId: professional._id.toString() },
      baseCtx(tenant, conversation._id.toString()),
    );

    expect('error' in result).toBe(false);
    if ('error' in result) throw new Error('unreachable');
    expect(result.upcomingAppointments).toEqual([
      {
        date: dateInDisplayTz(ownFutureStart),
        time: '10:00',
        professionalName: 'Dra. Ana',
        status: 'pending',
      },
    ]);
  });

  it('returns {error} when the Conversation of ctx cannot be resolved for this tenant (spec.md Edge Cases, same defense-in-depth as create_order)', async () => {
    const tenant = randomId();
    const targetDate = displayDateOffsetByDays(1);

    const result = await getAvailableSlots({ date: targetDate }, baseCtx(tenant, randomId()));

    expect(result).toEqual({ error: expect.any(String) });
  });
});
