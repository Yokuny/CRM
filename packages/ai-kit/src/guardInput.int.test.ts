import crypto from 'node:crypto';
import { Conversation, connect, disconnect, type MessageType } from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
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
});
