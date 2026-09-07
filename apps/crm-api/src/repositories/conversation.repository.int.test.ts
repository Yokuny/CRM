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
});
