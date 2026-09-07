import crypto from 'node:crypto';
import { Conversation, connect, disconnect, type MessageType } from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  guardInput,
  MAX_INPUT_TEXT_LENGTH,
  RATE_LIMIT_MAX_MESSAGES,
  RATE_LIMITED_REPLY,
  TOO_LONG_REPLY,
  UNSUPPORTED_TYPE_REPLY,
} from './guardInput.js';

const randomId = (): string => crypto.randomBytes(12).toString('hex');

const seedConversation = async (overrides: Partial<Record<string, unknown>> = {}) => {
  return Conversation.create({
    Tenant: randomId(),
    Channel: randomId(),
    Customer: randomId(),
    ...overrides,
  });
};

describe('guardInput (AIG-10/11)', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
  });

  afterEach(async () => {
    await Conversation.deleteMany({});
  });

  afterAll(async () => {
    await disconnect();
  });

  it('text within the size limit → {ok:true, text}', async () => {
    const conversation = await seedConversation();

    const result = await guardInput({ type: 'text', text: 'oi' }, conversation);

    expect(result).toEqual({ ok: true, text: 'oi' });
  });

  it('text above the size limit → {ok:false, fixedReply}, without touching the rate limit counter', async () => {
    const conversation = await seedConversation();
    const tooLong = 'a'.repeat(MAX_INPUT_TEXT_LENGTH + 1);

    const result = await guardInput({ type: 'text', text: tooLong }, conversation);

    expect(result).toEqual({ ok: false, fixedReply: TOO_LONG_REPLY });
    const updated = await Conversation.findById(conversation._id).lean();
    expect(updated?.rateWindowCount).toBeUndefined();
  });

  it.each(['audio', 'image', 'document', 'location', 'unsupported'] as MessageType[])(
    'non-text type "%s" → {ok:false, fixedReply} of unsupported type, without touching the rate limit counter',
    async (type) => {
      const conversation = await seedConversation();

      const result = await guardInput({ type, text: 'oi' }, conversation);

      expect(result).toEqual({ ok: false, fixedReply: UNSUPPORTED_TYPE_REPLY });
      const updated = await Conversation.findById(conversation._id).lean();
      expect(updated?.rateWindowCount).toBeUndefined();
    },
  );

  it('allows exactly 20 messages in the 60s window and rejects the 21st with the rate-limit fixedReply', async () => {
    const conversation = await seedConversation();

    for (let i = 0; i < RATE_LIMIT_MAX_MESSAGES; i++) {
      const result = await guardInput({ type: 'text', text: `msg-${i}` }, conversation);
      expect(result.ok).toBe(true);
    }

    const rejected = await guardInput({ type: 'text', text: 'excedente' }, conversation);

    expect(rejected).toEqual({ ok: false, fixedReply: RATE_LIMITED_REPLY });
    const updated = await Conversation.findById(conversation._id).lean();
    expect(updated?.rateWindowCount).toBe(RATE_LIMIT_MAX_MESSAGES);
  });

  it('two concurrent rate-limit bumps never both increment past the cap (atomic claim)', async () => {
    const conversation = await seedConversation({
      rateWindowStart: new Date(),
      rateWindowCount: RATE_LIMIT_MAX_MESSAGES - 1,
    });

    const [a, b] = await Promise.all([
      guardInput({ type: 'text', text: 'a' }, conversation),
      guardInput({ type: 'text', text: 'b' }, conversation),
    ]);

    const okCount = [a, b].filter((r) => r.ok).length;
    expect(okCount).toBe(1);
    const updated = await Conversation.findById(conversation._id).lean();
    expect(updated?.rateWindowCount).toBe(RATE_LIMIT_MAX_MESSAGES);
  });

  describe('structured logging on rejection (AIG-44)', () => {
    it('logs {event:"guard_rejected", reason:"unsupported_type"} for a non-text/non-transcribed message', async () => {
      const conversation = await seedConversation();
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

      await guardInput({ type: 'image', text: 'oi' }, conversation);

      const loggedEvents = logSpy.mock.calls.map(([arg]) => JSON.parse(arg as string));
      expect(loggedEvents).toContainEqual({ event: 'guard_rejected', reason: 'unsupported_type' });
      logSpy.mockRestore();
    });

    it('logs {event:"guard_rejected", reason:"too_long"} for oversized text', async () => {
      const conversation = await seedConversation();
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

      await guardInput({ type: 'text', text: 'a'.repeat(MAX_INPUT_TEXT_LENGTH + 1) }, conversation);

      const loggedEvents = logSpy.mock.calls.map(([arg]) => JSON.parse(arg as string));
      expect(loggedEvents).toContainEqual({ event: 'guard_rejected', reason: 'too_long' });
      logSpy.mockRestore();
    });

    it('logs {event:"guard_rejected", reason:"rate_limited"} for a message over the rate limit', async () => {
      const conversation = await seedConversation({
        rateWindowStart: new Date(),
        rateWindowCount: RATE_LIMIT_MAX_MESSAGES,
      });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

      await guardInput({ type: 'text', text: 'excedente' }, conversation);

      const loggedEvents = logSpy.mock.calls.map(([arg]) => JSON.parse(arg as string));
      expect(loggedEvents).toContainEqual({ event: 'guard_rejected', reason: 'rate_limited' });
      logSpy.mockRestore();
    });
  });

  it('throttles the rate-limit warning: only the FIRST excess message in a window gets fixedReply, the 2nd/3rd get {ok:false} with none (AIG-11)', async () => {
    const conversation = await seedConversation({
      rateWindowStart: new Date(),
      rateWindowCount: RATE_LIMIT_MAX_MESSAGES,
    });

    const first = await guardInput({ type: 'text', text: 'excedente-1' }, conversation);
    const second = await guardInput({ type: 'text', text: 'excedente-2' }, conversation);
    const third = await guardInput({ type: 'text', text: 'excedente-3' }, conversation);

    expect(first).toEqual({ ok: false, fixedReply: RATE_LIMITED_REPLY });
    expect(second).toEqual({ ok: false });
    expect(third).toEqual({ ok: false });
    const updated = await Conversation.findById(conversation._id).lean();
    expect(updated?.rateLimitWarnedWindowStart?.getTime()).toBe(conversation.rateWindowStart?.getTime());
  });

  it('a NEW rate-limit window (after the previous one expired) warns again, even if the old window was already warned (AIG-11)', async () => {
    const conversation = await seedConversation({
      rateWindowStart: new Date(Date.now() - 61_000),
      rateWindowCount: RATE_LIMIT_MAX_MESSAGES,
      rateLimitWarnedWindowStart: new Date(Date.now() - 61_000),
    });

    // Preenche a nova janela até o teto sem receber nenhum aviso (allowed):
    for (let i = 0; i < RATE_LIMIT_MAX_MESSAGES; i++) {
      const result = await guardInput({ type: 'text', text: `msg-${i}` }, conversation);
      expect(result.ok).toBe(true);
    }

    const rejected = await guardInput({ type: 'text', text: 'excedente da nova janela' }, conversation);

    expect(rejected).toEqual({ ok: false, fixedReply: RATE_LIMITED_REPLY });
  });

  it('resets the window after it has expired, allowing messages again', async () => {
    const conversation = await seedConversation({
      rateWindowStart: new Date(Date.now() - 61_000),
      rateWindowCount: RATE_LIMIT_MAX_MESSAGES,
    });

    const result = await guardInput({ type: 'text', text: 'depois da janela' }, conversation);

    expect(result).toEqual({ ok: true, text: 'depois da janela' });
    const updated = await Conversation.findById(conversation._id).lean();
    expect(updated?.rateWindowCount).toBe(1);
  });

  // P2 (T47, AIG-46 AC2): áudio transcrito com sucesso por ingest.ts segue o
  // MESMO caminho de guardInput do texto digitado (tamanho, rate limit) —
  // `transcribedText` só chega preenchido pelo pipeline real (runTurn.ts),
  // nunca por quem chama guardInput isoladamente (o it.each acima, que
  // nunca define `transcribedText`, continua caindo no fallback fixo).
  describe('P2 — áudio transcrito (AIG-46)', () => {
    it('type "audio" with a successful transcribedText within the size limit → {ok:true, text:transcribedText} — same path as typed text', async () => {
      const conversation = await seedConversation();

      const result = await guardInput(
        { type: 'audio', transcribedText: 'Quero saber o status do meu pedido' },
        conversation,
      );

      expect(result).toEqual({ ok: true, text: 'Quero saber o status do meu pedido' });
    });

    it('type "audio" with a transcribedText above the size limit → {ok:false, fixedReply:TOO_LONG_REPLY} — same size gate as typed text', async () => {
      const conversation = await seedConversation();
      const tooLong = 'a'.repeat(MAX_INPUT_TEXT_LENGTH + 1);

      const result = await guardInput({ type: 'audio', transcribedText: tooLong }, conversation);

      expect(result).toEqual({ ok: false, fixedReply: TOO_LONG_REPLY });
    });

    it('type "audio" with transcribedText hitting an exhausted rate limit → {ok:false, fixedReply:RATE_LIMITED_REPLY} — same rate-limit gate as typed text', async () => {
      const conversation = await seedConversation({
        rateWindowStart: new Date(),
        rateWindowCount: RATE_LIMIT_MAX_MESSAGES,
      });

      const result = await guardInput({ type: 'audio', transcribedText: 'mais uma mensagem' }, conversation);

      expect(result).toEqual({ ok: false, fixedReply: RATE_LIMITED_REPLY });
    });

    it('type "audio" WITHOUT transcribedText still falls back to the unsupported-type reply (Whisper failure / P1, AIG-47)', async () => {
      const conversation = await seedConversation();

      const result = await guardInput({ type: 'audio' }, conversation);

      expect(result).toEqual({ ok: false, fixedReply: UNSUPPORTED_TYPE_REPLY });
    });
  });
});
