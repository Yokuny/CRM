import crypto from 'node:crypto';
import { connect, disconnect, Message } from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { reapStuckMessages, startReaper } from './reaper.js';

const randomId = (): string => crypto.randomBytes(12).toString('hex');

const seedMessage = async (overrides: Record<string, unknown> = {}) =>
  Message.create({
    Tenant: randomId(),
    Conversation: randomId(),
    Channel: randomId(),
    Customer: randomId(),
    direction: 'out',
    type: 'text',
    status: 'queued',
    text: 'olá',
    ...overrides,
  });

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('reaper (AIG-30)', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
    await Message.init();
  });

  afterEach(async () => {
    await Message.deleteMany({});
  });

  afterAll(async () => {
    await disconnect();
  });

  it('reverts a message stuck in sending for more than staleAfterMs back to queued, clearing claim bookkeeping', async () => {
    const stuck = await seedMessage({
      status: 'sending',
      claimedBy: 'holder-x',
      claimedAt: new Date(Date.now() - 61_000),
    });

    const reaped = await reapStuckMessages(60000);

    expect(reaped).toBe(1);
    const updated = await Message.findById(stuck._id).lean();
    expect(updated?.status).toBe('queued');
    expect(updated?.claimedBy).toBeUndefined();
    expect(updated?.claimedAt).toBeUndefined();
  });

  it('never reverts a stuck message that already has a wamid recorded (ADR-0007 protection against duplicate resend)', async () => {
    const stuck = await seedMessage({
      status: 'sending',
      claimedBy: 'holder-x',
      claimedAt: new Date(Date.now() - 61_000),
      wamid: 'wamid-already-sent',
    });

    const reaped = await reapStuckMessages(60000);

    expect(reaped).toBe(0);
    const updated = await Message.findById(stuck._id).lean();
    expect(updated?.status).toBe('sending');
    expect(updated?.wamid).toBe('wamid-already-sent');
  });

  it('never touches a message that has been sending for less than staleAfterMs', async () => {
    const fresh = await seedMessage({ status: 'sending', claimedBy: 'holder-x', claimedAt: new Date() });

    const reaped = await reapStuckMessages(60000);

    expect(reaped).toBe(0);
    const updated = await Message.findById(fresh._id).lean();
    expect(updated?.status).toBe('sending');
  });

  it('is a no-op with no side effects on queued/sent/failed messages when nothing is stuck in sending', async () => {
    const queued = await seedMessage({ status: 'queued' });
    const sent = await seedMessage({ status: 'sent', wamid: 'wamid-sent' });
    const failed = await seedMessage({ status: 'failed', error: 'boom' });

    const reaped = await reapStuckMessages(60000);

    expect(reaped).toBe(0);
    expect((await Message.findById(queued._id).lean())?.status).toBe('queued');
    expect((await Message.findById(sent._id).lean())?.status).toBe('sent');
    expect((await Message.findById(failed._id).lean())?.status).toBe('failed');
  });

  it('startReaper ticks on the given interval and stop() halts further reaping', async () => {
    const first = await seedMessage({
      status: 'sending',
      claimedBy: 'holder-x',
      claimedAt: new Date(Date.now() - 100),
    });
    const handle = startReaper(20, 50);
    await sleep(80);
    handle.stop();
    const afterFirstTick = await Message.findById(first._id).lean();
    expect(afterFirstTick?.status).toBe('queued');

    const second = await seedMessage({
      status: 'sending',
      claimedBy: 'holder-y',
      claimedAt: new Date(Date.now() - 100),
    });
    await sleep(80);

    const afterStop = await Message.findById(second._id).lean();
    expect(afterStop?.status).toBe('sending');
  });
});
