import crypto from 'node:crypto';
import { AiSession, connect, Conversation, disconnect, Message } from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { purgeExpiredConversations } from './retentionPurge.js';

const randomId = (): string => crypto.randomBytes(12).toString('hex');

const seedConversation = async (overrides: Record<string, unknown> = {}) =>
  Conversation.create({
    Tenant: randomId(),
    Channel: randomId(),
    Customer: randomId(),
    ...overrides,
  });

const seedMessage = async (conversationId: unknown, overrides: Record<string, unknown> = {}) =>
  Message.create({
    Tenant: randomId(),
    Conversation: conversationId,
    Channel: randomId(),
    Customer: randomId(),
    direction: 'in',
    type: 'text',
    text: 'olá',
    ...overrides,
  });

const seedAiSession = async (conversationId: unknown, overrides: Record<string, unknown> = {}) =>
  AiSession.create({
    Tenant: randomId(),
    Conversation: conversationId,
    ...overrides,
  });

// OPS-09/10/11: purgeExpiredConversations é uma função pura chamada
// diretamente (sem depender do setInterval do worker, T6) — mesmo padrão de
// reapStuckMessages (reaper.int.test.ts).
describe('purgeExpiredConversations (OPS-09/10/11)', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
    await Conversation.init();
    await Message.init();
    await AiSession.init();
  });

  afterEach(async () => {
    await Conversation.deleteMany({});
    await Message.deleteMany({});
    await AiSession.deleteMany({});
  });

  afterAll(async () => {
    await disconnect();
  });

  it('OPS-09: deletes a Conversation older than retentionMs with its Message/AiSession; leaves a newer Conversation and one exactly at the cutoff untouched ($lt boundary)', async () => {
    // Date congelado (só `Date`, setTimeout/setInterval reais seguem — o
    // driver do Mongo depende deles) para que "exatamente no corte" seja
    // determinístico: sem isso, o tempo real gasto nos seeds/awaits abaixo
    // empurraria o `Date.now()` lido DENTRO de purgeExpiredConversations para
    // além do valor capturado aqui, classificando o caso de borda como
    // expirado por engano.
    const retentionMs = 1000;
    const fixedNow = new Date('2030-01-01T00:00:00.000Z').getTime();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(fixedNow);

    try {
      const expired = await seedConversation({ createdAt: new Date(fixedNow - retentionMs - 1) });
      await seedMessage(expired._id);
      await seedAiSession(expired._id);

      const fresh = await seedConversation({ createdAt: new Date(fixedNow - 100) });
      await seedMessage(fresh._id);

      const atCutoff = await seedConversation({ createdAt: new Date(fixedNow - retentionMs) });
      await seedMessage(atCutoff._id);

      const result = await purgeExpiredConversations(retentionMs);

      expect(result.conversations).toBe(1);
      expect(await Conversation.findById(expired._id).lean()).toBeNull();
      expect(await Conversation.findById(fresh._id).lean()).not.toBeNull();
      expect(await Conversation.findById(atCutoff._id).lean()).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('OPS-10: cascade deletes every Message and AiSession referencing an expired Conversation — none left orphaned', async () => {
    const retentionMs = 1000;
    const expired = await seedConversation({ createdAt: new Date(Date.now() - retentionMs - 1000) });
    await seedMessage(expired._id);
    await seedMessage(expired._id);
    await seedMessage(expired._id);
    await seedAiSession(expired._id);

    const result = await purgeExpiredConversations(retentionMs);

    expect(result.messages).toBe(3);
    expect(result.aiSessions).toBe(1);
    expect(await Message.countDocuments({ Conversation: expired._id })).toBe(0);
    expect(await AiSession.countDocuments({ Conversation: expired._id })).toBe(0);
  });

  it('OPS-11: returns {conversations:0, messages:0, aiSessions:0} without throwing when nothing is expired', async () => {
    await seedConversation({ createdAt: new Date() });

    const result = await purgeExpiredConversations(1000);

    expect(result).toEqual({ conversations: 0, messages: 0, aiSessions: 0 });
  });

  it('is idempotent: running twice on the same expired data returns zeros with no error on the second run', async () => {
    const retentionMs = 1000;
    const expired = await seedConversation({ createdAt: new Date(Date.now() - retentionMs - 1000) });
    await seedMessage(expired._id);
    await seedAiSession(expired._id);

    const first = await purgeExpiredConversations(retentionMs);
    expect(first).toEqual({ conversations: 1, messages: 1, aiSessions: 1 });

    const second = await purgeExpiredConversations(retentionMs);
    expect(second).toEqual({ conversations: 0, messages: 0, aiSessions: 0 });
  });
});
