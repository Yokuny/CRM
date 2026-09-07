import crypto from 'node:crypto';
import {
  Channel,
  Conversation,
  Customer,
  claimTurnLock,
  connect,
  disconnect,
  FieldTemplate,
  Message,
  releaseTurnLock,
} from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { checkConversationMode, ingest } from './ingest.js';

// Sem `mongoose` aqui (AD-010/boundary) — mesmo padrão dos tool executors
// (T14-T17).
const randomId = (): string => crypto.randomBytes(12).toString('hex');
const randomPhone = (): string => `119${crypto.randomInt(10000000, 99999999)}`;

const seedCustomerTemplate = async (tenant: string) => {
  return FieldTemplate.create({
    Tenant: tenant,
    targetType: 'customer',
    key: 'cliente',
    name: 'Cliente',
    currentVersion: 1,
    archived: false,
  });
};

const seedChannel = async (tenant: string, phoneNumberId: string) => {
  return Channel.create({
    Tenant: tenant,
    phoneNumberId,
    accessTokenEnc: { ciphertext: 'c', iv: 'i', authTag: 'a' },
    status: 'active',
  });
};

describe('ingest (AIG-07/08/09/25/12/32)', () => {
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
  });

  afterAll(async () => {
    await disconnect();
  });

  it('resolves Channel→Tenant, creates Customer+Conversation+Message{in} for a fresh phone, and claims the turnLock', async () => {
    const tenant = randomId();
    const phoneNumberId = randomId();
    const from = randomPhone();
    await seedCustomerTemplate(tenant);
    const channel = await seedChannel(tenant, phoneNumberId);

    const result = await ingest({ phoneNumberId, wamid: 'wamid-1', from, type: 'text', text: 'oi' });

    expect(result.resolved).toBe(true);
    if (!result.resolved) throw new Error('unreachable');
    expect(result.isDuplicate).toBe(false);
    expect(result.channel._id.toString()).toBe(channel._id.toString());
    expect(result.customer.phone).toBe(from);
    expect(result.message.text).toBe('oi');
    expect(result.message.wamid).toBe('wamid-1');
    expect(result.conversation.turnLock).toEqual(expect.objectContaining({ holder: result.message._id.toString() }));
    expect(await Customer.countDocuments({ Tenant: tenant })).toBe(1);
  });

  it('returns {resolved:false} and creates nothing for a phoneNumberId with no matching Channel', async () => {
    const result = await ingest({ phoneNumberId: 'unknown', wamid: 'wamid-x', from: randomPhone(), type: 'text' });

    expect(result).toEqual({ resolved: false });
    expect(await Message.countDocuments({})).toBe(0);
    expect(await Conversation.countDocuments({})).toBe(0);
  });

  it('the same wamid called twice persists exactly 1 Message — the 2nd call reports isDuplicate:true', async () => {
    const tenant = randomId();
    const phoneNumberId = randomId();
    const from = randomPhone();
    await seedCustomerTemplate(tenant);
    await seedChannel(tenant, phoneNumberId);

    const first = await ingest({ phoneNumberId, wamid: 'wamid-dup', from, type: 'text', text: 'oi' });
    const second = await ingest({ phoneNumberId, wamid: 'wamid-dup', from, type: 'text', text: 'oi' });

    expect(first.resolved && first.isDuplicate).toBe(false);
    expect(second.resolved && second.isDuplicate).toBe(true);
    expect(await Message.countDocuments({ wamid: 'wamid-dup' })).toBe(1);
  });

  it('reuses the same Conversation for a 2nd message from the same Customer (different wamid)', async () => {
    const tenant = randomId();
    const phoneNumberId = randomId();
    const from = randomPhone();
    await seedCustomerTemplate(tenant);
    await seedChannel(tenant, phoneNumberId);

    const first = await ingest(
      { phoneNumberId, wamid: 'wamid-a', from, type: 'text', text: 'oi' },
      { turnLockPollMs: 10, turnLockCeilingMs: 30 },
    );
    const second = await ingest(
      { phoneNumberId, wamid: 'wamid-b', from, type: 'text', text: 'de novo' },
      { turnLockPollMs: 10, turnLockCeilingMs: 30 },
    );

    if (!first.resolved || !second.resolved) throw new Error('unreachable');
    expect(second.conversation._id.toString()).toBe(first.conversation._id.toString());
    expect(await Conversation.countDocuments({})).toBe(1);
  });

  it('waits with poll for an already-claimed turnLock, then claims it once released', async () => {
    const tenant = randomId();
    const phoneNumberId = randomId();
    const from = randomPhone();
    await seedCustomerTemplate(tenant);
    await seedChannel(tenant, phoneNumberId);
    const first = await ingest({ phoneNumberId, wamid: 'wamid-lock-1', from, type: 'text', text: 'oi' });
    if (!first.resolved) throw new Error('unreachable');
    // turnLock segue reivindicado por `first` (ingest nunca libera — persist/dispatch, T23, faz isso).
    expect(first.conversation.turnLock).not.toBeNull();

    setTimeout(() => {
      void releaseTurnLock(first.conversation._id.toString());
    }, 30);

    const second = await ingest(
      { phoneNumberId, wamid: 'wamid-lock-2', from, type: 'text', text: 'segunda' },
      { turnLockPollMs: 10, turnLockCeilingMs: 2000 },
    );

    if (!second.resolved) throw new Error('unreachable');
    expect(second.conversation.turnLock).toEqual(expect.objectContaining({ holder: second.message._id.toString() }));
  });

  it('proceeds anyway (no throw) once the turnLock poll ceiling is exceeded, without ever claiming the lock', async () => {
    const tenant = randomId();
    const phoneNumberId = randomId();
    const from = randomPhone();
    await seedCustomerTemplate(tenant);
    await seedChannel(tenant, phoneNumberId);
    const first = await ingest({ phoneNumberId, wamid: 'wamid-ceil-1', from, type: 'text', text: 'oi' });
    if (!first.resolved) throw new Error('unreachable');
    const holderBefore = first.conversation.turnLock?.holder;

    const second = await ingest(
      { phoneNumberId, wamid: 'wamid-ceil-2', from, type: 'text', text: 'segunda' },
      { turnLockPollMs: 10, turnLockCeilingMs: 30 },
    );

    expect(second.resolved).toBe(true);
    if (!second.resolved) throw new Error('unreachable');
    // Nunca reivindicado pela 2ª ingest — o holder continua sendo o da 1ª mensagem.
    expect(second.conversation.turnLock?.holder).toBe(holderBefore);
  });

  it('claimTurnLock never lets two concurrent claims over the same Conversation both succeed', async () => {
    const tenant = randomId();
    const channel = await seedChannel(tenant, randomId());
    const conversation = await Conversation.create({ Tenant: tenant, Channel: channel._id, Customer: randomId() });

    const [a, b] = await Promise.all([
      claimTurnLock(conversation._id.toString(), 'req-a'),
      claimTurnLock(conversation._id.toString(), 'req-b'),
    ]);

    const claimedCount = [a, b].filter((r) => r !== null).length;
    expect(claimedCount).toBe(1);
  });

  it('checkConversationMode returns true when mode is "human"', () => {
    expect(checkConversationMode({ mode: 'human' })).toBe(true);
  });

  it('checkConversationMode returns false when mode is "bot"', () => {
    expect(checkConversationMode({ mode: 'bot' })).toBe(false);
  });
});
