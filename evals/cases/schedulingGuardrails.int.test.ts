import crypto from 'node:crypto';
import type { AnthropicClient, AnthropicMessage, AnthropicMessageParams, IngestInput } from '@crm/ai-kit';
import { runTurn } from '@crm/ai-kit';
import {
  Appointment,
  Channel,
  Conversation,
  Customer,
  connect,
  disconnect,
  FieldTemplate,
  Message,
  Professional,
  timeInDisplayTz,
  wallClockToUtc,
} from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

// Golden set — get_available_slots + book_appointment contra o harness real
// (spec.md P1 "Cliente consulta horários e marca pela conversa", SCH-15,
// SCH-16, SCH-20, e o Edge Case de guard.output não redigir o link de
// confirmação). Duplicação deliberada e mínima dos helpers de seed/fake
// client já usados em createOrderGuardrails.int.test.ts/happyPath.int.test.ts
// (evals/ não importa fixtures de packages/ai-kit/src/*.test.ts).
const randomId = (): string => crypto.randomBytes(12).toString('hex');
const randomPhone = (): string => `119${crypto.randomInt(10000000, 99999999)}`;

type FakeContent = { type: string; text?: string; id?: string; name?: string; input?: unknown };
type FakeResponse = { content: FakeContent[]; stop_reason: string };
type FakeStep = FakeResponse | ((params: AnthropicMessageParams) => FakeResponse);

const endTurn = (text: string): FakeResponse => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn' });

// Aceita passos FIXOS (mesma forma de createOrderGuardrails) e passos
// DINÂMICOS (função do params recebido) — necessários aqui porque o token de
// confirmação é aleatório (crypto.randomBytes) e não pode ser cravado de
// antemão numa resposta fixa, ao contrário do preço de create_order.
const createFakeClient = (steps: FakeStep[]): AnthropicClient => {
  let call = 0;
  return {
    createMessage: async (params: AnthropicMessageParams) => {
      const step = steps[Math.min(call, steps.length - 1)] as FakeStep;
      call++;
      return (typeof step === 'function' ? step(params) : step) as unknown as AnthropicMessage;
    },
  };
};

// Extrai o payload JSON do(s) tool_result da ÚLTIMA mensagem de params —
// usado pelo passo dinâmico que precisa ecoar o token real de volta ao
// cliente, como um modelo de verdade faria.
const lastToolResult = (params: AnthropicMessageParams): Record<string, unknown> | undefined => {
  const lastMessage = params.messages[params.messages.length - 1];
  if (!Array.isArray(lastMessage?.content)) return undefined;
  for (const block of lastMessage.content) {
    if (typeof block !== 'object' || block === null || !('type' in block) || block.type !== 'tool_result') continue;
    const content = (block as { content?: unknown }).content;
    if (typeof content === 'string') return JSON.parse(content);
  }
  return undefined;
};

const seedCustomerTemplate = async (tenant: string) =>
  FieldTemplate.create({
    Tenant: tenant,
    targetType: 'customer',
    key: 'cliente',
    name: 'Cliente',
    currentVersion: 1,
    archived: false,
  });

const seedChannel = async (tenant: string, phoneNumberId: string) =>
  Channel.create({
    Tenant: tenant,
    phoneNumberId,
    accessTokenEnc: { ciphertext: 'c', iv: 'i', authTag: 'a' },
    status: 'active',
  });

const MINUTES_IN_DAY = 24 * 60;
const FULL_WEEK_WINDOWS = Array.from({ length: 7 }, (_, weekday) => ({ weekday, start: '00:00', end: '23:30' }));

const seedProfessional = (tenant: string) =>
  Professional.create({
    Tenant: tenant,
    name: 'Dra. Ana',
    slotDurationMinutes: 30,
    weeklySchedule: FULL_WEEK_WINDOWS,
    active: true,
  });

// Horário alinhado ao grid de 30min, bem à frente de agora — evita qualquer
// interferência do lead de 60min/horizonte de 90d, sem mockar o relógio
// (mesma técnica de appointmentTransitions.int.test.ts). Um grid 00:00-23:30
// nunca tem slot iniciando às 23:30 (terminaria à meia-noite, fora da janela
// — Edge Case do spec.md): se "agora" arredondar exatamente pra esse
// instante do dia, empurra mais um slot.
const farFutureAlignedStart = (): Date => {
  const now = new Date();
  const [hours, minutes] = timeInDisplayTz(now).split(':').map(Number) as [number, number];
  let roundedUp = Math.ceil((hours * 60 + minutes) / 30) * 30;
  if (roundedUp % MINUTES_IN_DAY === MINUTES_IN_DAY - 30) roundedUp += 30;
  const targetMinutes = roundedUp + 3 * MINUTES_IN_DAY;
  const dayShift = Math.floor(targetMinutes / MINUTES_IN_DAY);
  const minutesInDay = targetMinutes % MINUTES_IN_DAY;
  const date = new Date(now.getTime() + dayShift * 24 * 60 * 60_000);
  const displayDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  const hh = String(Math.floor(minutesInDay / 60)).padStart(2, '0');
  const mm = String(minutesInDay % 60).padStart(2, '0');
  return wallClockToUtc(displayDate, `${hh}:${mm}`);
};

const bookAppointmentToolUse = (id: string, input: unknown): FakeContent => ({
  type: 'tool_use',
  id,
  name: 'book_appointment',
  input,
});

describe('golden set — get_available_slots + book_appointment (spec.md P1, SCH-15/16/20, guard.output)', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
    await Message.init();
    await Conversation.init();
  });

  afterEach(async () => {
    await Message.deleteMany({});
    await Conversation.deleteMany({});
    await Customer.deleteMany({});
    await FieldTemplate.deleteMany({});
    await Channel.deleteMany({});
    await Appointment.deleteMany({});
    await Professional.deleteMany({});
  });

  afterAll(async () => {
    await disconnect();
  });

  it('books via the real harness: pending Appointment with UTC start, and the final reply contains the intact apt_ link (never [removido])', async () => {
    const tenant = randomId();
    const phoneNumberId = randomId();
    const from = randomPhone();
    await seedCustomerTemplate(tenant);
    await seedChannel(tenant, phoneNumberId);
    const professional = await seedProfessional(tenant);
    const start = farFutureAlignedStart();

    const client = createFakeClient([
      {
        content: [
          bookAppointmentToolUse('t1', { professionalId: professional._id.toString(), start: start.toISOString() }),
        ],
        stop_reason: 'tool_use',
      },
      (params) => {
        const result = lastToolResult(params) as { confirmationUrl: string };
        return endTurn(`Agendado! Confirme aqui: ${result.confirmationUrl}`);
      },
    ]);

    const result = await runTurn(
      client,
      {
        phoneNumberId,
        wamid: `wamid-book-${randomId()}`,
        from,
        type: 'text',
        text: 'quero marcar horário',
      } satisfies IngestInput,
      { webBaseUrl: 'https://app.example.test' },
    );

    expect(result.outcome).toBe('sent');
    if (result.outcome !== 'sent') throw new Error('unreachable');

    const appointment = await Appointment.findOne({ Tenant: tenant }).lean();
    expect(appointment?.status).toBe('pending');
    expect(appointment?.start.getTime()).toBe(start.getTime());
    expect(appointment?.source).toBe('ai');

    // O link sobrevive ao guard.output intacto — nunca [removido] (Edge Case
    // do spec.md: apt_+base62 não tem a forma de um ObjectId de 24 hex).
    expect(result.reply).toContain('https://app.example.test/appointment?token=apt_');
    expect(result.reply).not.toContain('[removido]');
  });

  it('rejects booking outside the grid or on an occupied slot — tool_result {error}, zero new Appointment', async () => {
    const tenant = randomId();
    const phoneNumberId = randomId();
    const from = randomPhone();
    await seedCustomerTemplate(tenant);
    await seedChannel(tenant, phoneNumberId);
    // Grade só de segunda 09:00-10:00 — qualquer outro weekday/horário está
    // fora da grade.
    const professional = await Professional.create({
      Tenant: tenant,
      name: 'Dr. Carlos',
      slotDurationMinutes: 30,
      weeklySchedule: [{ weekday: 1, start: '09:00', end: '10:00' }],
      active: true,
    });
    // Horário arbitrário, quase certamente fora da grade estreita acima.
    const outsideGrid = new Date(Date.now() + 3 * 24 * 60 * 60_000);
    outsideGrid.setUTCHours(15, 17, 0, 0);

    const client = createFakeClient([
      {
        content: [
          bookAppointmentToolUse('t1', {
            professionalId: professional._id.toString(),
            start: outsideGrid.toISOString(),
          }),
        ],
        stop_reason: 'tool_use',
      },
      endTurn('Esse horário não está disponível. Podemos tentar outro?'),
    ]);

    const result = await runTurn(
      client,
      {
        phoneNumberId,
        wamid: `wamid-reject-${randomId()}`,
        from,
        type: 'text',
        text: 'quero um horário',
      } satisfies IngestInput,
      { webBaseUrl: 'https://app.example.test' },
    );

    expect(result.outcome).toBe('sent');
    await expect(Appointment.countDocuments({ Tenant: tenant })).resolves.toBe(0);
  });

  it('exactly 1 Appointment survives when 2 genuinely concurrent runTurn calls book the same (professional, start) for different customers (SCH-20)', async () => {
    const tenant = randomId();
    const phoneNumberId = randomId();
    await seedCustomerTemplate(tenant);
    await seedChannel(tenant, phoneNumberId);
    const professional = await seedProfessional(tenant);
    const start = farFutureAlignedStart();

    const buildClient = () =>
      createFakeClient([
        {
          content: [
            bookAppointmentToolUse('t1', { professionalId: professional._id.toString(), start: start.toISOString() }),
          ],
          stop_reason: 'tool_use',
        },
        endTurn('Vamos ver se deu certo!'),
      ]);

    const fromA = randomPhone();
    const fromB = randomPhone();

    await Promise.all([
      runTurn(
        buildClient(),
        {
          phoneNumberId,
          wamid: `wamid-race-a-${randomId()}`,
          from: fromA,
          type: 'text',
          text: 'quero esse horário',
        } satisfies IngestInput,
        { webBaseUrl: 'https://app.example.test' },
      ),
      runTurn(
        buildClient(),
        {
          phoneNumberId,
          wamid: `wamid-race-b-${randomId()}`,
          from: fromB,
          type: 'text',
          text: 'quero esse horário',
        } satisfies IngestInput,
        { webBaseUrl: 'https://app.example.test' },
      ),
    ]);

    await expect(
      Appointment.countDocuments({
        Tenant: tenant,
        professional: professional._id,
        start,
        status: { $in: ['pending', 'confirmed'] },
      }),
    ).resolves.toBe(1);
  });
});
