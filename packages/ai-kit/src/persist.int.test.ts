import crypto from 'node:crypto';
import type Anthropic from '@anthropic-ai/sdk';
import { AiSession, Conversation, claimTurnLock, connect, disconnect, Message } from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { dispatch, persist } from './persist.js';
import type { AnthropicClient, AnthropicMessage } from './providers/anthropicClient.js';

const randomId = (): string => crypto.randomBytes(12).toString('hex');

type FakeResponse = { content: Array<{ type: string; text?: string }> };

// Fake determinístico do client Anthropic (T11, injetável) — NUNCA a SDK
// real (mesmo padrão de loop.int.test.ts).
const createFakeClient = (response?: FakeResponse): AnthropicClient & { createMessage: ReturnType<typeof vi.fn> } => {
  const createMessage = vi.fn(async () => (response ?? { content: [] }) as unknown as AnthropicMessage);
  return { createMessage };
};

const baseConversation = () => ({
  _id: randomId(),
  Tenant: randomId(),
  Channel: randomId(),
  Customer: randomId(),
});

type HistoryEntry = { role: 'user' | 'assistant'; content: unknown };

const seedAiSession = async (
  conversationId: string,
  overrides: { rawHistory?: HistoryEntry[]; summary?: string; totalMessageCount?: number } = {},
) => {
  return AiSession.create({
    Tenant: randomId(),
    Conversation: conversationId,
    rawHistory: overrides.rawHistory ?? [],
    summary: overrides.summary,
    totalMessageCount: overrides.totalMessageCount ?? overrides.rawHistory?.length ?? 0,
  });
};

describe('persist + dispatch (AIG-21/23/24)', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
  });

  afterEach(async () => {
    await Message.deleteMany({});
    await AiSession.deleteMany({});
    await Conversation.deleteMany({});
  });

  afterAll(async () => {
    await disconnect();
  });

  it("creates Message{direction:'out', status:'queued'} with the post-guardOutput text", async () => {
    const conversation = baseConversation();
    const aiSession = await seedAiSession(conversation._id);
    const client = createFakeClient();

    const message = await persist(client, conversation, aiSession, [{ role: 'user', content: 'oi' }], 'resposta final');

    expect(message.direction).toBe('out');
    expect(message.status).toBe('queued');
    expect(message.text).toBe('resposta final');
    const stored = await Message.findById(message._id).lean();
    expect(stored?.status).toBe('queued');
    expect(stored?.text).toBe('resposta final');
  });

  it('AiSession.rawHistory gains this turn — below 20 messages NEVER calls the anthropicClient (rolling summary)', async () => {
    const conversation = baseConversation();
    const aiSession = await seedAiSession(conversation._id, { rawHistory: [], totalMessageCount: 0 });
    const client = createFakeClient();
    const turnMessages: Anthropic.MessageParam[] = [
      { role: 'user', content: 'oi' },
      { role: 'assistant', content: 'olá' },
    ];

    await persist(client, conversation, aiSession, turnMessages, 'olá');

    const updated = await AiSession.findById(aiSession._id).lean();
    expect(updated?.rawHistory).toEqual(turnMessages);
    expect(updated?.totalMessageCount).toBe(2);
    expect(client.createMessage).not.toHaveBeenCalled();
  });

  it('crossing the 20+10 threshold calls the (mocked) anthropicClient to update summary and keeps only the newest 20 in rawHistory', async () => {
    const conversation = baseConversation();
    const existingHistory: HistoryEntry[] = Array.from({ length: 28 }, (_, i) => ({
      role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: `mensagem antiga ${i}`,
    }));
    const aiSession = await seedAiSession(conversation._id, { rawHistory: existingHistory, totalMessageCount: 28 });
    const client = createFakeClient({ content: [{ type: 'text', text: 'Resumo: cliente perguntou sobre X e Y.' }] });
    const turnMessages: Anthropic.MessageParam[] = [
      { role: 'user', content: 'mais uma pergunta' },
      { role: 'assistant', content: 'mais uma resposta' },
    ];

    await persist(client, conversation, aiSession, turnMessages, 'mais uma resposta');

    expect(client.createMessage).toHaveBeenCalledTimes(1);
    const updated = await AiSession.findById(aiSession._id).lean();
    expect(updated?.rawHistory).toHaveLength(20);
    expect(updated?.rawHistory).toEqual([...existingHistory.slice(-18), ...turnMessages]);
    expect(updated?.summary).toBe('Resumo: cliente perguntou sobre X e Y.');
    expect(updated?.totalMessageCount).toBe(30);
  });

  it('stays just below the 20+10 threshold (29 total) without capping rawHistory or calling the anthropicClient', async () => {
    const conversation = baseConversation();
    const existingHistory: HistoryEntry[] = Array.from({ length: 27 }, (_, i) => ({
      role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: `mensagem antiga ${i}`,
    }));
    const aiSession = await seedAiSession(conversation._id, { rawHistory: existingHistory, totalMessageCount: 27 });
    const client = createFakeClient();
    const turnMessages: Anthropic.MessageParam[] = [
      { role: 'user', content: 'pergunta' },
      { role: 'assistant', content: 'resposta' },
    ];

    await persist(client, conversation, aiSession, turnMessages, 'resposta');

    expect(client.createMessage).not.toHaveBeenCalled();
    const updated = await AiSession.findById(aiSession._id).lean();
    expect(updated?.rawHistory).toHaveLength(29);
    expect(updated?.totalMessageCount).toBe(29);
  });

  it('passes the PRIOR summary as context into the rolling-summary call, for continuity across resummarizations', async () => {
    const conversation = baseConversation();
    const existingHistory: HistoryEntry[] = Array.from({ length: 28 }, (_, i) => ({
      role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: `mensagem antiga ${i}`,
    }));
    const aiSession = await seedAiSession(conversation._id, {
      rawHistory: existingHistory,
      totalMessageCount: 58,
      summary: 'Resumo anterior: cliente perguntou sobre Z.',
    });
    const client = createFakeClient({ content: [{ type: 'text', text: 'Novo resumo consolidado.' }] });
    const turnMessages: Anthropic.MessageParam[] = [
      { role: 'user', content: 'mais uma pergunta' },
      { role: 'assistant', content: 'mais uma resposta' },
    ];

    await persist(client, conversation, aiSession, turnMessages, 'mais uma resposta');

    const [params] = client.createMessage.mock.calls[0] as [Anthropic.MessageCreateParamsNonStreaming];
    const firstMessageContent = params.messages[0].content;
    expect(firstMessageContent).toContain('Resumo anterior: cliente perguntou sobre Z.');
    const updated = await AiSession.findById(aiSession._id).lean();
    expect(updated?.summary).toBe('Novo resumo consolidado.');
  });

  it('releases the turnLock (null) at the end — a 2nd ingest of the same Conversation can claim it right after', async () => {
    const conversation = await Conversation.create({
      Tenant: randomId(),
      Channel: randomId(),
      Customer: randomId(),
      turnLock: { holder: 'req-1', claimedAt: new Date() },
    });

    await dispatch({ Conversation: conversation._id });

    const released = await Conversation.findById(conversation._id).lean();
    expect(released?.turnLock).toBeNull();
    const nextClaim = await claimTurnLock(conversation._id.toString(), 'req-2');
    expect(nextClaim).not.toBeNull();
  });
});
