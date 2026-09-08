import crypto from 'node:crypto';
import { Channel, Conversation, Customer, connect, disconnect, Message } from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { InboxSocketServer, InboxWsEvent } from '../ws/inboxSocket.js';
import { pollOnce, startInboxPoller } from './inboxPoller.js';

const randomId = (): string => crypto.randomBytes(12).toString('hex');
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Poll (não sleep fixo) — o tempo real de um tick varia com a carga do
// MongoMemoryServer compartilhado entre TODOS os arquivos de integração
// (vitest.config.ts, AD-031); um sleep fixo curto o bastante pra ser rápido
// vira flake sob carga. Mesma ideia de waitUntil já usada em
// inboxSocket.e2e.test.ts (T4).
const waitUntil = async (predicate: () => boolean, timeoutMs = 3000): Promise<void> => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitUntil: timeout esperando a condição ficar verdadeira');
    await sleep(10);
  }
};

// Mesmo padrão de fake injetado do design.md ("mesmo padrão de createClient
// fake em outboxConsumer.int.test.ts") — nenhum WebSocketServer real sobe
// aqui, só espiões sobre a interface pública de InboxSocketServer.
const fakeSocketServer = (connectedTenantIds: string[]): InboxSocketServer => ({
  broadcastToTenant: vi.fn(),
  broadcastToConversation: vi.fn(),
  getConnectedTenantIds: () => connectedTenantIds,
  close: vi.fn(),
});

const seedChannel = async (tenant: string) =>
  Channel.create({
    Tenant: tenant,
    phoneNumberId: randomId(),
    accessTokenEnc: { ciphertext: 'c', iv: 'i', authTag: 'a' },
    status: 'active',
  });

const seedCustomer = async (tenant: string) =>
  Customer.create({
    Tenant: tenant,
    name: 'Cliente',
    phone: '11900000000',
    template: randomId(),
    templateVersion: 1,
    values: {},
  });

const seedConversation = async (
  tenant: string,
  channelId: string,
  customerId: string,
  overrides: Record<string, unknown> = {},
) => Conversation.create({ Tenant: tenant, Channel: channelId, Customer: customerId, ...overrides });

const seedInMessage = async (
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
    direction: 'in',
    type: 'text',
    text: 'oi, tudo bem?',
    ...overrides,
  });

describe('inboxPoller (T5)', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
    await Message.init();
  });

  afterEach(async () => {
    await Promise.all([
      Message.deleteMany({}),
      Conversation.deleteMany({}),
      Channel.deleteMany({}),
      Customer.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await disconnect();
  });

  describe('pollOnce', () => {
    it('only considers Message updates for tenants with a connected socket, ignoring other tenants entirely', async () => {
      const connectedTenant = randomId();
      const disconnectedTenant = randomId();
      const [connectedChannel, disconnectedChannel] = await Promise.all([
        seedChannel(connectedTenant),
        seedChannel(disconnectedTenant),
      ]);
      const [connectedCustomer, disconnectedCustomer] = await Promise.all([
        seedCustomer(connectedTenant),
        seedCustomer(disconnectedTenant),
      ]);
      const connectedConversation = await seedConversation(
        connectedTenant,
        connectedChannel._id.toString(),
        connectedCustomer._id.toString(),
      );
      const disconnectedConversation = await seedConversation(
        disconnectedTenant,
        disconnectedChannel._id.toString(),
        disconnectedCustomer._id.toString(),
      );
      await seedInMessage(
        connectedTenant,
        connectedConversation._id.toString(),
        connectedChannel._id.toString(),
        connectedCustomer._id.toString(),
      );
      await seedInMessage(
        disconnectedTenant,
        disconnectedConversation._id.toString(),
        disconnectedChannel._id.toString(),
        disconnectedCustomer._id.toString(),
      );
      const socketServer = fakeSocketServer([connectedTenant]);

      await pollOnce(socketServer, new Date(Date.now() - 60_000));

      expect(socketServer.broadcastToConversation).toHaveBeenCalledTimes(1);
      expect(socketServer.broadcastToConversation).toHaveBeenCalledWith(
        connectedTenant,
        connectedConversation._id.toString(),
        expect.objectContaining({ type: 'message.new' }),
      );
    });

    it('broadcasts the full Message (minus binary) to the conversation room, and a light conversation.updated payload to the tenant room', async () => {
      const tenant = randomId();
      const channel = await seedChannel(tenant);
      const customer = await seedCustomer(tenant);
      const lastActivityAt = new Date('2026-01-01T00:00:00.000Z');
      const lastInboundAt = new Date('2026-01-01T00:05:00.000Z');
      const conversation = await seedConversation(tenant, channel._id.toString(), customer._id.toString(), {
        lastActivityAt,
        lastInboundAt,
      });
      const message = await seedInMessage(
        tenant,
        conversation._id.toString(),
        channel._id.toString(),
        customer._id.toString(),
        {
          media: { mediaId: 'wamid-media-1', mime: 'image/png', caption: 'foto' },
          type: 'image',
          text: undefined,
        },
      );
      const socketServer = fakeSocketServer([tenant]);

      await pollOnce(socketServer, new Date(Date.now() - 60_000));

      const conversationId = conversation._id.toString();
      expect(socketServer.broadcastToConversation).toHaveBeenCalledWith(tenant, conversationId, {
        type: 'message.new',
        conversationId,
        message: {
          id: message._id.toString(),
          conversationId,
          direction: 'in',
          type: 'image',
          status: undefined,
          text: undefined,
          media: { mediaId: 'wamid-media-1', mime: 'image/png', caption: 'foto' },
          createdAt: message.createdAt.toISOString(),
        },
      });

      const expectedEvent: InboxWsEvent = {
        type: 'conversation.updated',
        conversationId,
        lastActivityAt: lastActivityAt.toISOString(),
        unread: true,
      };
      expect(socketServer.broadcastToTenant).toHaveBeenCalledWith(tenant, expectedEvent);
    });

    it('recalculates unread as false when lastInboundAt is not after lastActivityAt', async () => {
      const tenant = randomId();
      const channel = await seedChannel(tenant);
      const customer = await seedCustomer(tenant);
      const lastActivityAt = new Date('2026-01-01T00:10:00.000Z');
      const lastInboundAt = new Date('2026-01-01T00:00:00.000Z'); // antes de lastActivityAt
      const conversation = await seedConversation(tenant, channel._id.toString(), customer._id.toString(), {
        lastActivityAt,
        lastInboundAt,
      });
      await seedInMessage(tenant, conversation._id.toString(), channel._id.toString(), customer._id.toString());
      const socketServer = fakeSocketServer([tenant]);

      await pollOnce(socketServer, new Date(Date.now() - 60_000));

      expect(socketServer.broadcastToTenant).toHaveBeenCalledWith(tenant, expect.objectContaining({ unread: false }));
    });

    it('advances the cursor even when there is no new Message, never reprocessing the same window', async () => {
      const socketServer = fakeSocketServer([randomId()]);
      const since = new Date(Date.now() - 60_000);

      const next = await pollOnce(socketServer, since);

      expect(next.getTime()).toBeGreaterThan(since.getTime());
      expect(socketServer.broadcastToConversation).not.toHaveBeenCalled();
      expect(socketServer.broadcastToTenant).not.toHaveBeenCalled();
    });

    it('advances the cursor even when there are no connected tenants at all', async () => {
      const socketServer = fakeSocketServer([]);
      const since = new Date(Date.now() - 60_000);

      const next = await pollOnce(socketServer, since);

      expect(next.getTime()).toBeGreaterThan(since.getTime());
    });
  });

  describe('startInboxPoller', () => {
    it('ticks on the given interval, broadcasting a new message exactly once (never reprocessed), and stop() halts further ticking', async () => {
      const tenant = randomId();
      const channel = await seedChannel(tenant);
      const customer = await seedCustomer(tenant);
      const conversation = await seedConversation(tenant, channel._id.toString(), customer._id.toString());
      const socketServer = fakeSocketServer([tenant]);
      const calls = () => (socketServer.broadcastToConversation as ReturnType<typeof vi.fn>).mock.calls.length;

      const handle = startInboxPoller(socketServer, 20);
      await seedInMessage(tenant, conversation._id.toString(), channel._id.toString(), customer._id.toString());
      await waitUntil(() => calls() > 0);

      // Deixa vários outros ticks rodarem antes de parar — se o cursor
      // reprocessasse a mesma janela, `calls()` cresceria além de 1.
      await sleep(120);
      expect(calls()).toBe(1);

      handle.stop();
      const callsAfterStop = calls();
      await sleep(100);
      expect(calls()).toBe(callsAfterStop);
    });

    it('catches and logs a tick failure (simulated DB error) as inbox_poller.tick_failed; the next tick still runs normally', async () => {
      const tenant = randomId();
      const channel = await seedChannel(tenant);
      const customer = await seedCustomer(tenant);
      const conversation = await seedConversation(tenant, channel._id.toString(), customer._id.toString());
      const socketServer = fakeSocketServer([tenant]);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const findSpy = vi.spyOn(Message, 'find').mockImplementationOnce(() => {
        throw new Error('Mongo indisponível');
      });

      const handle = startInboxPoller(socketServer, 20);
      await waitUntil(() => errorSpy.mock.calls.length > 0);
      findSpy.mockRestore();
      await seedInMessage(tenant, conversation._id.toString(), channel._id.toString(), customer._id.toString());
      await waitUntil(() => (socketServer.broadcastToConversation as ReturnType<typeof vi.fn>).mock.calls.length > 0);
      handle.stop();

      const loggedEvents = errorSpy.mock.calls.map(([arg]) => JSON.parse(arg as string));
      expect(loggedEvents).toContainEqual({ event: 'inbox_poller.tick_failed', message: 'Mongo indisponível' });
      // Próximo tick (depois do restore) roda normalmente e entrega a mensagem.
      expect(socketServer.broadcastToConversation).toHaveBeenCalled();

      errorSpy.mockRestore();
    });
  });
});
