import crypto from 'node:crypto';
import { Channel, Conversation, Customer, connect, disconnect, Message } from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import * as conversationRepository from './conversation.repository.js';

// Sem `mongoose` aqui (AD-010/boundary estrutural: só packages/db importa
// mongoose) — mesmo padrão de customer.repository.int.test.ts.
const randomId = (): string => crypto.randomBytes(12).toString('hex');

const seedConversation = async (tenantId: string, overrides: Partial<Record<string, unknown>> = {}) => {
  const channel = await Channel.create({
    Tenant: tenantId,
    phoneNumberId: randomId(),
    accessTokenEnc: { ciphertext: 'c', iv: 'i', authTag: 'a' },
    status: 'active',
  });
  const customer = await Customer.create({
    Tenant: tenantId,
    name: 'Cliente Teste',
    phone: '11900000000',
    template: randomId(),
    templateVersion: 1,
    values: {},
  });
  const conversation = await Conversation.create({
    Tenant: tenantId,
    Channel: channel._id,
    Customer: customer._id,
    mode: 'bot',
    lastActivityAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  });
  return { channel, customer, conversation };
};

describe('conversation.repository', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
    await Conversation.init();
    await Message.init();
  });

  afterEach(async () => {
    await Promise.all([
      Conversation.deleteMany({}),
      Message.deleteMany({}),
      Channel.deleteMany({}),
      Customer.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await disconnect();
  });

  describe('takeover', () => {
    it("changes mode to 'human', records the assignee, and refreshes lastActivityAt (AIG-31, idle-sweep base)", async () => {
      const tenantId = randomId();
      const userId = randomId();
      const { conversation } = await seedConversation(tenantId);

      const result = await conversationRepository.takeover(conversation._id.toString(), tenantId, userId);

      expect(result?.mode).toBe('human');
      expect(result?.assignee).toBe(userId);
      expect(result?.lastActivityAt.getTime()).toBeGreaterThan(new Date('2024-01-01T00:00:00.000Z').getTime());
      const persisted = await Conversation.findById(conversation._id).lean();
      expect(persisted?.mode).toBe('human');
      expect(persisted?.assignee?.toString()).toBe(userId);
    });

    it("never takes over another tenant's Conversation — {_id,Tenant} filter, nothing changes (AD-010)", async () => {
      const ownerTenant = randomId();
      const otherTenant = randomId();
      const { conversation } = await seedConversation(ownerTenant);

      const result = await conversationRepository.takeover(conversation._id.toString(), otherTenant, randomId());

      expect(result).toBeNull();
      const persisted = await Conversation.findById(conversation._id).lean();
      expect(persisted?.mode).toBe('bot');
      expect(persisted?.assignee).toBeFalsy();
    });

    it('is idempotent: the same assignee taking over again succeeds without corrupting state (spec.md INBOX-08/AC2)', async () => {
      const tenantId = randomId();
      const userId = randomId();
      const { conversation } = await seedConversation(tenantId, { mode: 'human', assignee: userId });

      const result = await conversationRepository.takeover(conversation._id.toString(), tenantId, userId);

      expect(result?.mode).toBe('human');
      expect(result?.assignee).toBe(userId);
      const persisted = await Conversation.findById(conversation._id).lean();
      expect(persisted?.mode).toBe('human');
      expect(persisted?.assignee?.toString()).toBe(userId);
    });

    it('never overwrites a Conversation already assigned to a DIFFERENT operator — returns null, assignee untouched (spec.md INBOX-08/AC3, context.md decision #6)', async () => {
      const tenantId = randomId();
      const currentAssignee = randomId();
      const otherUserId = randomId();
      const { conversation } = await seedConversation(tenantId, { mode: 'human', assignee: currentAssignee });

      const result = await conversationRepository.takeover(conversation._id.toString(), tenantId, otherUserId);

      expect(result).toBeNull();
      const persisted = await Conversation.findById(conversation._id).lean();
      expect(persisted?.mode).toBe('human');
      expect(persisted?.assignee?.toString()).toBe(currentAssignee);
    });
  });

  describe('findConversationById (helper for the T12 already-assigned conflict lookup)', () => {
    it('returns the Conversation record for the session tenant', async () => {
      const tenantId = randomId();
      const assignee = randomId();
      const { conversation } = await seedConversation(tenantId, { mode: 'human', assignee });

      const result = await conversationRepository.findConversationById(conversation._id.toString(), tenantId);

      expect(result?.id).toBe(conversation._id.toString());
      expect(result?.mode).toBe('human');
      expect(result?.assignee).toBe(assignee);
    });

    it("returns null for another tenant's Conversation and for a non-existent id (AD-010)", async () => {
      const ownerTenant = randomId();
      const otherTenant = randomId();
      const { conversation } = await seedConversation(ownerTenant);

      expect(await conversationRepository.findConversationById(conversation._id.toString(), otherTenant)).toBeNull();
      expect(await conversationRepository.findConversationById(randomId(), ownerTenant)).toBeNull();
    });
  });

  describe('release', () => {
    it("changes mode back to 'bot' and clears the assignee immediately (AIG-34)", async () => {
      const tenantId = randomId();
      const { conversation } = await seedConversation(tenantId, { mode: 'human', assignee: randomId() });

      const result = await conversationRepository.release(conversation._id.toString(), tenantId);

      expect(result?.mode).toBe('bot');
      expect(result?.assignee).toBeUndefined();
      const persisted = await Conversation.findById(conversation._id).lean();
      expect(persisted?.mode).toBe('bot');
      expect(persisted?.assignee).toBeFalsy();
    });

    it("never releases another tenant's Conversation, nothing changes (AD-010)", async () => {
      const ownerTenant = randomId();
      const otherTenant = randomId();
      const { conversation } = await seedConversation(ownerTenant, { mode: 'human', assignee: randomId() });

      const result = await conversationRepository.release(conversation._id.toString(), otherTenant);

      expect(result).toBeNull();
      const persisted = await Conversation.findById(conversation._id).lean();
      expect(persisted?.mode).toBe('human');
    });
  });

  describe('createOutboundMessage', () => {
    it('rejects free text BEFORE inserting when the Conversation is outside the 24h window (AD-005/AIG-37)', async () => {
      const tenantId = randomId();
      const { conversation } = await seedConversation(tenantId, {
        windowExpiresAt: new Date(Date.now() - 60_000),
      });

      await expect(
        conversationRepository.createOutboundMessage(conversation._id.toString(), tenantId, { text: 'oi' }),
      ).rejects.toThrow(conversationRepository.OutsideWindowError);
      expect(await Message.countDocuments({ Conversation: conversation._id })).toBe(0);
    });

    it('accepts free text and creates Message{status:queued} when inside the 24h window (AIG-36)', async () => {
      const tenantId = randomId();
      const { conversation } = await seedConversation(tenantId, {
        windowExpiresAt: new Date(Date.now() + 60_000),
      });

      const result = await conversationRepository.createOutboundMessage(conversation._id.toString(), tenantId, {
        text: 'olá, tudo certo?',
      });

      expect(result.status).toBe('queued');
      expect(result.text).toBe('olá, tudo certo?');
      const persisted = await Message.findById(result.id).lean();
      expect(persisted?.direction).toBe('out');
      expect(persisted?.status).toBe('queued');
    });

    it('always accepts a template, inside or outside the window (AIG-36)', async () => {
      const tenantId = randomId();
      const { conversation } = await seedConversation(tenantId, {
        windowExpiresAt: new Date(Date.now() - 60_000),
      });

      const result = await conversationRepository.createOutboundMessage(conversation._id.toString(), tenantId, {
        templateName: 'confirmacao',
        templateLanguage: 'pt_BR',
        templateParams: { nome: 'Maria' },
      });

      expect(result.status).toBe('queued');
      expect(result.templateName).toBe('confirmacao');
      const persisted = await Message.findById(result.id).lean();
      expect(persisted?.templateName).toBe('confirmacao');
      expect(persisted?.templateParams).toEqual({ nome: 'Maria' });
    });

    it("throws ConversationNotFoundError for another tenant's Conversation, creating no Message (AD-010)", async () => {
      const ownerTenant = randomId();
      const otherTenant = randomId();
      const { conversation } = await seedConversation(ownerTenant, {
        windowExpiresAt: new Date(Date.now() + 60_000),
      });

      await expect(
        conversationRepository.createOutboundMessage(conversation._id.toString(), otherTenant, { text: 'oi' }),
      ).rejects.toThrow(conversationRepository.ConversationNotFoundError);
      expect(await Message.countDocuments({})).toBe(0);
    });
  });

  describe('listConversations (INBOX-01/03)', () => {
    // Channel.Tenant é único (um canal por tenant) e Conversation{Channel,
    // Customer} também — testes que precisam de VÁRIAS conversas no MESMO
    // tenant reusam um único Channel e criam um Customer novo por conversa.
    const seedConversationsForTenant = async (tenantId: string, overridesList: Partial<Record<string, unknown>>[]) => {
      const channel = await Channel.create({
        Tenant: tenantId,
        phoneNumberId: randomId(),
        accessTokenEnc: { ciphertext: 'c', iv: 'i', authTag: 'a' },
        status: 'active',
      });
      const conversations = [];
      for (const overrides of overridesList) {
        const customer = await Customer.create({
          Tenant: tenantId,
          name: 'Cliente Teste',
          phone: `119${crypto.randomInt(10000000, 99999999)}`,
          template: randomId(),
          templateVersion: 1,
          values: {},
        });
        conversations.push(
          await Conversation.create({
            Tenant: tenantId,
            Channel: channel._id,
            Customer: customer._id,
            mode: 'bot',
            lastActivityAt: new Date('2024-01-01T00:00:00.000Z'),
            ...overrides,
          }),
        );
      }
      return conversations;
    };

    it("returns only Conversations of the session's tenant, never another tenant's (AD-010)", async () => {
      const ownerTenant = randomId();
      const otherTenant = randomId();
      const { conversation } = await seedConversation(ownerTenant);
      await seedConversation(otherTenant);

      const result = await conversationRepository.listConversations(ownerTenant, {}, { page: 1, limit: 20 });

      expect(result.total).toBe(1);
      expect(result.items.map((item) => item.id)).toEqual([conversation._id.toString()]);
    });

    it('filters by mode alone, returning only matching Conversations', async () => {
      const tenantId = randomId();
      const [botConversation] = await seedConversationsForTenant(tenantId, [
        { mode: 'bot' },
        { mode: 'human', assignee: randomId() },
      ]);

      const result = await conversationRepository.listConversations(tenantId, { mode: 'bot' }, { page: 1, limit: 20 });

      expect(result.total).toBe(1);
      expect(result.items.map((item) => item.id)).toEqual([botConversation._id.toString()]);
    });

    it('filters by assignee alone, returning only matching Conversations', async () => {
      const tenantId = randomId();
      const assigneeA = randomId();
      const assigneeB = randomId();
      const [conversationA] = await seedConversationsForTenant(tenantId, [
        { mode: 'human', assignee: assigneeA },
        { mode: 'human', assignee: assigneeB },
      ]);

      const result = await conversationRepository.listConversations(
        tenantId,
        { assignee: assigneeA },
        { page: 1, limit: 20 },
      );

      expect(result.total).toBe(1);
      expect(result.items.map((item) => item.id)).toEqual([conversationA._id.toString()]);
    });

    it('combines mode and assignee filters (AND, not OR)', async () => {
      const tenantId = randomId();
      const assignee = randomId();
      const [target] = await seedConversationsForTenant(tenantId, [
        { mode: 'human', assignee },
        // Mesmo assignee, mode diferente — não deveria casar.
        { mode: 'bot' },
        // Mesmo mode, assignee diferente — não deveria casar.
        { mode: 'human', assignee: randomId() },
      ]);

      const result = await conversationRepository.listConversations(
        tenantId,
        { mode: 'human', assignee },
        { page: 1, limit: 20 },
      );

      expect(result.total).toBe(1);
      expect(result.items.map((item) => item.id)).toEqual([target._id.toString()]);
    });

    it('computes unread as true when lastInboundAt is after lastActivityAt', async () => {
      const tenantId = randomId();
      const { conversation } = await seedConversation(tenantId, {
        lastActivityAt: new Date('2026-01-01T00:00:00.000Z'),
        lastInboundAt: new Date('2026-01-01T00:05:00.000Z'),
      });

      const result = await conversationRepository.listConversations(tenantId, {}, { page: 1, limit: 20 });

      const item = result.items.find((i) => i.id === conversation._id.toString());
      expect(item?.unread).toBe(true);
    });

    it('computes unread as false when lastInboundAt is before (or equal to) lastActivityAt', async () => {
      const tenantId = randomId();
      const { conversation } = await seedConversation(tenantId, {
        lastActivityAt: new Date('2026-01-01T00:10:00.000Z'),
        lastInboundAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await conversationRepository.listConversations(tenantId, {}, { page: 1, limit: 20 });

      const item = result.items.find((i) => i.id === conversation._id.toString());
      expect(item?.unread).toBe(false);
    });

    it('computes unread as false when lastInboundAt is absent (no inbound message yet)', async () => {
      const tenantId = randomId();
      const { conversation } = await seedConversation(tenantId, {
        lastActivityAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await conversationRepository.listConversations(tenantId, {}, { page: 1, limit: 20 });

      const item = result.items.find((i) => i.id === conversation._id.toString());
      expect(item?.unread).toBe(false);
    });

    it('derives the 24h window state as open when windowExpiresAt is in the future (spec.md INBOX-01/AC1)', async () => {
      const tenantId = randomId();
      const windowExpiresAt = new Date(Date.now() + 60_000);
      const { conversation } = await seedConversation(tenantId, { windowExpiresAt });

      const result = await conversationRepository.listConversations(tenantId, {}, { page: 1, limit: 20 });

      const item = result.items.find((i) => i.id === conversation._id.toString());
      expect(item?.windowOpen).toBe(true);
      expect(item?.windowExpiresAt).toEqual(windowExpiresAt);
    });

    it('derives the 24h window state as closed when windowExpiresAt is in the past, or absent entirely (spec.md INBOX-01/AC1)', async () => {
      const tenantId = randomId();
      const [expired, neverSet] = await seedConversationsForTenant(tenantId, [
        { windowExpiresAt: new Date(Date.now() - 60_000) },
        {},
      ]);

      const result = await conversationRepository.listConversations(tenantId, {}, { page: 1, limit: 20 });

      const expiredItem = result.items.find((i) => i.id === expired._id.toString());
      const neverSetItem = result.items.find((i) => i.id === neverSet._id.toString());
      expect(expiredItem?.windowOpen).toBe(false);
      expect(neverSetItem?.windowOpen).toBe(false);
      expect(neverSetItem?.windowExpiresAt).toBeUndefined();
    });

    it('paginates: total reflects the full matching set, items are cut to the requested page/limit', async () => {
      const tenantId = randomId();
      const conversations = await seedConversationsForTenant(
        tenantId,
        Array.from({ length: 5 }, (_, i) => ({ lastActivityAt: new Date(Date.UTC(2026, 0, 1, 0, i, 0)) })),
      );

      const page1 = await conversationRepository.listConversations(tenantId, {}, { page: 1, limit: 2 });
      const page2 = await conversationRepository.listConversations(tenantId, {}, { page: 2, limit: 2 });

      expect(page1.total).toBe(5);
      expect(page1.items).toHaveLength(2);
      expect(page2.total).toBe(5);
      expect(page2.items).toHaveLength(2);
      // Ordenado por lastActivityAt desc — página 1 traz os 2 mais recentes
      // (índices 4,3), página 2 os 2 seguintes (índices 2,1); nenhuma
      // sobreposição de id entre as páginas.
      const page1Ids = page1.items.map((item) => item.id);
      const page2Ids = page2.items.map((item) => item.id);
      expect(page1Ids).toEqual([conversations[4]._id.toString(), conversations[3]._id.toString()]);
      expect(page2Ids).toEqual([conversations[2]._id.toString(), conversations[1]._id.toString()]);
      expect(page1Ids.some((id) => page2Ids.includes(id))).toBe(false);
    });
  });

  describe('getMessages (INBOX-05/06)', () => {
    const seedMessage = async (
      tenantId: string,
      conversation: Awaited<ReturnType<typeof seedConversation>>['conversation'],
      overrides: Partial<Record<string, unknown>>,
    ) =>
      Message.create({
        Tenant: tenantId,
        Conversation: conversation._id,
        Channel: conversation.Channel,
        Customer: conversation.Customer,
        direction: 'in',
        type: 'text',
        ...overrides,
      });

    it('returns messages of the Conversation in chronological order (spec.md INBOX-05/AC1)', async () => {
      const tenantId = randomId();
      const { conversation } = await seedConversation(tenantId);
      const second = await seedMessage(tenantId, conversation, {
        text: 'segunda',
        createdAt: new Date('2026-01-01T00:02:00.000Z'),
      });
      const first = await seedMessage(tenantId, conversation, {
        text: 'primeira',
        createdAt: new Date('2026-01-01T00:01:00.000Z'),
      });
      const third = await seedMessage(tenantId, conversation, {
        text: 'terceira',
        createdAt: new Date('2026-01-01T00:03:00.000Z'),
      });

      const result = await conversationRepository.getMessages(tenantId, conversation._id.toString(), {
        page: 1,
        limit: 20,
      });

      expect(result?.total).toBe(3);
      expect(result?.items.map((item) => item.id)).toEqual([
        first._id.toString(),
        second._id.toString(),
        third._id.toString(),
      ]);
    });

    it('paginates: total reflects the full set, items are cut to the requested page/limit', async () => {
      const tenantId = randomId();
      const { conversation } = await seedConversation(tenantId);
      const messages: Awaited<ReturnType<typeof seedMessage>>[] = [];
      for (let i = 0; i < 5; i += 1) {
        messages.push(
          await seedMessage(tenantId, conversation, {
            text: `msg-${i}`,
            createdAt: new Date(Date.UTC(2026, 0, 1, 0, i, 0)),
          }),
        );
      }

      const page1 = await conversationRepository.getMessages(tenantId, conversation._id.toString(), {
        page: 1,
        limit: 2,
      });
      const page2 = await conversationRepository.getMessages(tenantId, conversation._id.toString(), {
        page: 2,
        limit: 2,
      });

      expect(page1?.total).toBe(5);
      expect(page1?.items).toHaveLength(2);
      expect(page2?.total).toBe(5);
      expect(page2?.items).toHaveLength(2);
      expect(page1?.items.map((item) => item.id)).toEqual([messages[0]._id.toString(), messages[1]._id.toString()]);
      expect(page2?.items.map((item) => item.id)).toEqual([messages[2]._id.toString(), messages[3]._id.toString()]);
    });

    it("returns null for another tenant's Conversation, never leaking its messages (AD-010)", async () => {
      const ownerTenant = randomId();
      const otherTenant = randomId();
      const { conversation } = await seedConversation(ownerTenant);
      await seedMessage(ownerTenant, conversation, { text: 'só do dono' });

      const result = await conversationRepository.getMessages(otherTenant, conversation._id.toString(), {
        page: 1,
        limit: 20,
      });

      expect(result).toBeNull();
    });

    it('returns null for a non-existent Conversation id', async () => {
      const tenantId = randomId();

      const result = await conversationRepository.getMessages(tenantId, randomId(), { page: 1, limit: 20 });

      expect(result).toBeNull();
    });

    it('returns only the media pointer (mediaId/mime/caption) for image/document/audio/location messages, never a binary field (spec.md INBOX-05/AC3)', async () => {
      const tenantId = randomId();
      const { conversation } = await seedConversation(tenantId);
      await seedMessage(tenantId, conversation, {
        type: 'image',
        text: undefined,
        media: { mediaId: 'wamid-media-1', mime: 'image/png', caption: 'foto' },
      });

      const result = await conversationRepository.getMessages(tenantId, conversation._id.toString(), {
        page: 1,
        limit: 20,
      });

      const item = result?.items[0];
      expect(item?.media).toEqual({ mediaId: 'wamid-media-1', mime: 'image/png', caption: 'foto' });
      expect(Object.keys(item?.media ?? {}).sort()).toEqual(['caption', 'mediaId', 'mime']);
    });
  });
});
