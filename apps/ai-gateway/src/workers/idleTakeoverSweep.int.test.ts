import crypto from 'node:crypto';
import { Conversation, connect, disconnect } from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startIdleTakeoverSweep, sweepIdleConversations } from './idleTakeoverSweep.js';

const randomId = (): string => crypto.randomBytes(12).toString('hex');

const seedConversation = async (overrides: Record<string, unknown> = {}) =>
  Conversation.create({ Tenant: randomId(), Channel: randomId(), Customer: randomId(), ...overrides });

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('idleTakeoverSweep (AIG-33)', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
    await Conversation.init();
  });

  afterEach(async () => {
    await Conversation.deleteMany({});
  });

  afterAll(async () => {
    await disconnect();
  });

  it('reverts a mode:human Conversation idle for more than idleAfterMs back to bot, clearing assignee', async () => {
    const assignee = randomId();
    const conversation = await seedConversation({
      mode: 'human',
      assignee,
      lastActivityAt: new Date(Date.now() - 1_800_001),
    });

    const swept = await sweepIdleConversations(1_800_000);

    expect(swept).toBe(1);
    const updated = await Conversation.findById(conversation._id).lean();
    expect(updated?.mode).toBe('bot');
    expect(updated?.assignee).toBeUndefined();
  });

  it('never touches a mode:human Conversation whose lastActivityAt is within idleAfterMs', async () => {
    const conversation = await seedConversation({
      mode: 'human',
      assignee: randomId(),
      lastActivityAt: new Date(Date.now() - 1000),
    });

    const swept = await sweepIdleConversations(1_800_000);

    expect(swept).toBe(0);
    const updated = await Conversation.findById(conversation._id).lean();
    expect(updated?.mode).toBe('human');
  });

  it('never touches a mode:bot Conversation, no matter how old lastActivityAt is', async () => {
    const conversation = await seedConversation({ mode: 'bot', lastActivityAt: new Date(Date.now() - 1_800_001) });

    const swept = await sweepIdleConversations(1_800_000);

    expect(swept).toBe(0);
    const updated = await Conversation.findById(conversation._id).lean();
    expect(updated?.mode).toBe('bot');
  });

  it('startIdleTakeoverSweep ticks on the given interval and stop() halts further sweeping', async () => {
    const first = await seedConversation({
      mode: 'human',
      assignee: randomId(),
      lastActivityAt: new Date(Date.now() - 100),
    });
    const handle = startIdleTakeoverSweep(20, 50);
    await sleep(80);
    handle.stop();
    const afterFirstTick = await Conversation.findById(first._id).lean();
    expect(afterFirstTick?.mode).toBe('bot');

    const second = await seedConversation({
      mode: 'human',
      assignee: randomId(),
      lastActivityAt: new Date(Date.now() - 100),
    });
    await sleep(80);

    const afterStop = await Conversation.findById(second._id).lean();
    expect(afterStop?.mode).toBe('human');
  });
});
