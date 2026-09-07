import crypto from 'node:crypto';
import { Channel, type ChannelDocument, Conversation, Customer, connect, disconnect, Message } from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { MetaClient } from '../providers/metaClient.js';
import { claimQueuedMessage, type OutboxConsumerDeps, processNextOutboxMessage } from './outboxConsumer.js';

const randomId = (): string => crypto.randomBytes(12).toString('hex');
const randomPhone = (): string => `119${crypto.randomInt(10000000, 99999999)}`;

const ENC_KEY = 'unused-because-createClient-is-injected';
const FAST_RETRY_DELAYS_MS = [1, 1]; // 3 tentativas reais, sem esperar 1s/3s/9s de verdade

const createFakeMetaClient = (overrides: Partial<MetaClient> = {}): MetaClient => ({
  sendText: vi.fn().mockResolvedValue({ wamid: 'wamid-default' }),
  sendTemplate: vi.fn().mockResolvedValue({ wamid: 'wamid-default' }),
  getMediaUrl: vi.fn(),
  downloadMedia: vi.fn(),
  ...overrides,
});

const seedChannel = async (tenant: string): Promise<ChannelDocument> =>
  Channel.create({
    Tenant: tenant,
    phoneNumberId: randomId(),
    accessTokenEnc: { ciphertext: 'c', iv: 'i', authTag: 'a' },
    status: 'active',
  });

const seedCustomer = async (tenant: string, phone: string) =>
  Customer.create({ Tenant: tenant, name: 'Cliente', phone, template: randomId(), templateVersion: 1, values: {} });

const seedConversation = async (
  tenant: string,
  channelId: string,
  customerId: string,
  overrides: Record<string, unknown> = {},
) => Conversation.create({ Tenant: tenant, Channel: channelId, Customer: customerId, ...overrides });

const seedOutMessage = async (
  tenant: string,
  conversationId: string,
  channelId: string,
  customerId: string,
  overrides: Record<string, unknown> = {},
) =>
  Message.create({
    Tenant: tenant,
    Conversation: conversationId,
    Channel: channelId,
    Customer: customerId,
    direction: 'out',
    type: 'text',
    status: 'queued',
    text: 'olá, tudo bem?',
    ...overrides,
  });

describe('outboxConsumer (AIG-26/27/28/29)', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
    await Message.init();
  });

  afterEach(async () => {
    await Promise.all([
      Message.deleteMany({}),
      Conversation.deleteMany({}),
      Customer.deleteMany({}),
      Channel.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await disconnect();
  });

  it('two concurrent consumers never claim the same queued message (atomic claim, AIG-26)', async () => {
    const tenant = randomId();
    const channel = await seedChannel(tenant);
    const customer = await seedCustomer(tenant, randomPhone());
    const conversation = await seedConversation(tenant, channel._id.toString(), customer._id.toString(), {
      windowExpiresAt: new Date(Date.now() + 60_000),
    });
    await seedOutMessage(tenant, conversation._id.toString(), channel._id.toString(), customer._id.toString());

    const [a, b] = await Promise.all([claimQueuedMessage('holder-a'), claimQueuedMessage('holder-b')]);

    const claimedCount = [a, b].filter((r) => r !== null).length;
    expect(claimedCount).toBe(1);
  });

  it('a free-text message on a Conversation outside the 24h window fails without ever calling metaClient (AIG-27)', async () => {
    const tenant = randomId();
    const channel = await seedChannel(tenant);
    const customer = await seedCustomer(tenant, randomPhone());
    const conversation = await seedConversation(tenant, channel._id.toString(), customer._id.toString(), {
      windowExpiresAt: new Date(Date.now() - 60_000),
    });
    const message = await seedOutMessage(
      tenant,
      conversation._id.toString(),
      channel._id.toString(),
      customer._id.toString(),
    );
    const sendText = vi.fn();
    const deps: OutboxConsumerDeps = { encKey: ENC_KEY, createClient: () => createFakeMetaClient({ sendText }) };

    const result = await processNextOutboxMessage(deps);

    expect(result).toBe('claimed');
    expect(sendText).not.toHaveBeenCalled();
    const updated = await Message.findById(message._id).lean();
    expect(updated?.status).toBe('failed');
    expect(updated?.error).toBeTruthy();
  });

  it('a template message sends successfully even when the Conversation is outside the 24h window (AIG-27 exception)', async () => {
    const tenant = randomId();
    const channel = await seedChannel(tenant);
    const customer = await seedCustomer(tenant, randomPhone());
    const conversation = await seedConversation(tenant, channel._id.toString(), customer._id.toString(), {
      windowExpiresAt: new Date(Date.now() - 60_000),
    });
    const message = await seedOutMessage(
      tenant,
      conversation._id.toString(),
      channel._id.toString(),
      customer._id.toString(),
      {
        text: undefined,
        templateName: 'boas_vindas',
        templateLanguage: 'pt_BR',
      },
    );
    const sendTemplate = vi.fn().mockResolvedValue({ wamid: 'wamid-tpl' });
    const deps: OutboxConsumerDeps = { encKey: ENC_KEY, createClient: () => createFakeMetaClient({ sendTemplate }) };

    const result = await processNextOutboxMessage(deps);

    expect(result).toBe('claimed');
    expect(sendTemplate).toHaveBeenCalledTimes(1);
    const updated = await Message.findById(message._id).lean();
    expect(updated?.status).toBe('sent');
    expect(updated?.wamid).toBe('wamid-tpl');
  });

  // AIG-38: prova que uma mensagem enfileirada por um OPERADOR (via
  // apps/crm-api's createOutboundMessage/POST /conversations/:id/messages)
  // segue o MESMO caminho de claim/envio do bot — nenhuma lógica duplicada
  // por origem. apps/ai-gateway nunca importa apps/crm-api (apps não
  // dependem uma da outra neste monorepo — só packages/* são compartilhados),
  // então a prova é por FORMA idêntica de documento, não por import direto
  // do repository: `seedOutMessage` monta exatamente os mesmos campos que
  // createOutboundMessage grava (Tenant/Conversation/Channel/Customer/
  // direction:'out'/type:'text'/status:'queued'/text — confirmado linha a
  // linha contra conversation.repository.ts) — o model Message não tem, e
  // nunca teve, um campo de origem/discriminador (bot vs. operador) para
  // processNextOutboxMessage sequer poder ramificar por ele.
  it('an operator-enqueued message (same Message shape createOutboundMessage produces) is claimed and sent exactly like a bot message (AIG-38)', async () => {
    const tenant = randomId();
    const channel = await seedChannel(tenant);
    const customer = await seedCustomer(tenant, randomPhone());
    const conversation = await seedConversation(tenant, channel._id.toString(), customer._id.toString(), {
      windowExpiresAt: new Date(Date.now() + 60_000),
    });
    const message = await seedOutMessage(
      tenant,
      conversation._id.toString(),
      channel._id.toString(),
      customer._id.toString(),
      { text: 'Segue a atualização do seu pedido' },
    );
    const sendText = vi.fn().mockResolvedValue({ wamid: 'wamid-operator' });
    const deps: OutboxConsumerDeps = { encKey: ENC_KEY, createClient: () => createFakeMetaClient({ sendText }) };

    const result = await processNextOutboxMessage(deps);

    expect(result).toBe('claimed');
    expect(sendText).toHaveBeenCalledTimes(1);
    const updated = await Message.findById(message._id).lean();
    expect(updated?.status).toBe('sent');
    expect(updated?.wamid).toBe('wamid-operator');
  });

  it('retries a failing metaClient 2 times and succeeds on the 3rd, recording wamid and status:sent', async () => {
    const tenant = randomId();
    const channel = await seedChannel(tenant);
    const customer = await seedCustomer(tenant, randomPhone());
    const conversation = await seedConversation(tenant, channel._id.toString(), customer._id.toString(), {
      windowExpiresAt: new Date(Date.now() + 60_000),
    });
    const message = await seedOutMessage(
      tenant,
      conversation._id.toString(),
      channel._id.toString(),
      customer._id.toString(),
    );
    const sendText = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ wamid: 'wamid-3rd-attempt' });
    const deps: OutboxConsumerDeps = {
      encKey: ENC_KEY,
      createClient: () => createFakeMetaClient({ sendText }),
      retryDelaysMs: FAST_RETRY_DELAYS_MS,
    };

    const result = await processNextOutboxMessage(deps);

    expect(result).toBe('claimed');
    expect(sendText).toHaveBeenCalledTimes(3);
    const updated = await Message.findById(message._id).lean();
    expect(updated?.status).toBe('sent');
    expect(updated?.wamid).toBe('wamid-3rd-attempt');
  });

  it('marks the message failed with an error after 3 metaClient failures, logging a structured meta_send_failed event (AIG-29/44, terminal state)', async () => {
    const tenant = randomId();
    const channel = await seedChannel(tenant);
    const customer = await seedCustomer(tenant, randomPhone());
    const conversation = await seedConversation(tenant, channel._id.toString(), customer._id.toString(), {
      windowExpiresAt: new Date(Date.now() + 60_000),
    });
    const message = await seedOutMessage(
      tenant,
      conversation._id.toString(),
      channel._id.toString(),
      customer._id.toString(),
    );
    const sendText = vi.fn().mockRejectedValue(new Error('Meta indisponível'));
    const deps: OutboxConsumerDeps = {
      encKey: ENC_KEY,
      createClient: () => createFakeMetaClient({ sendText }),
      retryDelaysMs: FAST_RETRY_DELAYS_MS,
    };
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await processNextOutboxMessage(deps);

    expect(result).toBe('claimed');
    expect(sendText).toHaveBeenCalledTimes(3);
    const updated = await Message.findById(message._id).lean();
    expect(updated?.status).toBe('failed');
    expect(updated?.error).toContain('Meta indisponível');
    const loggedEvents = logSpy.mock.calls.map(([arg]) => JSON.parse(arg as string));
    expect(loggedEvents).toContainEqual({
      event: 'meta_send_failed',
      messageId: message._id.toString(),
      attempts: FAST_RETRY_DELAYS_MS.length + 1,
    });
    logSpy.mockRestore();
  });

  it('records wamid strictly before setting status:sent (ADR-0007, proven by call order)', async () => {
    const tenant = randomId();
    const channel = await seedChannel(tenant);
    const customer = await seedCustomer(tenant, randomPhone());
    const conversation = await seedConversation(tenant, channel._id.toString(), customer._id.toString(), {
      windowExpiresAt: new Date(Date.now() + 60_000),
    });
    await seedOutMessage(tenant, conversation._id.toString(), channel._id.toString(), customer._id.toString());
    const sendText = vi.fn().mockResolvedValue({ wamid: 'wamid-order-proof' });
    const deps: OutboxConsumerDeps = { encKey: ENC_KEY, createClient: () => createFakeMetaClient({ sendText }) };
    const updateOneSpy = vi.spyOn(Message, 'updateOne');

    await processNextOutboxMessage(deps);

    expect(updateOneSpy).toHaveBeenCalledTimes(2);
    const firstUpdate = updateOneSpy.mock.calls[0][1] as { $set: { wamid?: string } };
    const secondUpdate = updateOneSpy.mock.calls[1][1] as { $set: { status?: string } };
    expect(firstUpdate.$set.wamid).toBe('wamid-order-proof');
    expect(secondUpdate.$set.status).toBe('sent');
    updateOneSpy.mockRestore();
  });
});
