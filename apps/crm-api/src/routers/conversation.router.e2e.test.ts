import crypto from 'node:crypto';
import type { AnthropicClient, AnthropicMessage } from '@crm/ai-kit';
import { runTurn } from '@crm/ai-kit';
import type { Role } from '@crm/contracts';
import {
  Channel,
  Conversation,
  Customer,
  connect,
  disconnect,
  hashToken,
  Message,
  Session,
  syncIndexes,
  Tenant,
  User,
} from '@crm/db';
import cookieParser from 'cookie-parser';
import express from 'express';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { env } from '../config/env.config.js';
import type { AuthDeps } from '../middlewares/authentication.middleware.js';
import { createAuthMiddleware } from '../middlewares/authentication.middleware.js';
import { errorHandler } from '../middlewares/errorHandler.middleware.js';
import { createConversationRouter } from './conversation.router.js';

const DEVICE = 'test-agent';

// Sem `mongoose` aqui (AD-010/boundary estrutural: só packages/db importa
// mongoose) — mesmo padrão de customer.router.e2e.test.ts.
const randomId = (): string => crypto.randomBytes(12).toString('hex');
const randomPhone = (): string => `119${crypto.randomInt(10000000, 99999999)}`;

const buildAuthDeps = (): AuthDeps => ({
  findSessionByHash: async (tokenHash) => {
    const session = await Session.findOne({ tokenHash }).lean();
    return session ? { user: session.user.toString(), deviceInfo: session.deviceInfo } : null;
  },
  revokeAllSessions: async (userId) => {
    await Session.deleteMany({ user: userId });
  },
  getUserById: async (userId) => {
    const user = await User.findById(userId).lean();
    return user
      ? {
          id: user._id.toString(),
          tenant: user.Tenant?.toString(),
          role: user.role,
          isPlatformAdmin: user.isPlatformAdmin,
          active: user.active,
        }
      : null;
  },
  getTenantById: async (tenantId) => {
    const tenant = await Tenant.findById(tenantId).lean();
    return tenant ? { id: tenant._id.toString(), name: tenant.name, status: tenant.status } : null;
  },
});

const issueSessionCookie = async (userId: string): Promise<string> => {
  const rawToken = jwt.sign({ user: userId, jti: crypto.randomUUID() }, env.SESSION_JWT_SECRET);
  await Session.create({
    user: userId,
    tokenHash: hashToken(rawToken),
    deviceInfo: DEVICE,
    expiresAt: new Date(Date.now() + 3600_000),
  });
  return `refreshToken=${rawToken}`;
};

const buildTestApp = () => {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  const { validToken } = createAuthMiddleware(buildAuthDeps());
  app.use('/conversations', createConversationRouter({ validToken }));
  app.use(errorHandler);
  return app;
};

// Cada teste recebe seu PRÓPRIO Tenant — mesmo padrão de
// customer.router.e2e.test.ts (isolamento entre casos deste arquivo).
let seq = 0;
const seedTenantUser = async (role: Role[]) => {
  seq += 1;
  const tenant = await Tenant.create({
    name: `Empresa ${seq}`,
    document: String(10000000000000 + seq),
    status: 'active',
  });
  const user = await User.create({
    name: 'Fulano de Tal',
    email: `user-${seq}@empresa.com`,
    password: 'hash',
    Tenant: tenant._id,
    role,
  });
  const cookie = await issueSessionCookie(user.id);
  return { tenant, user, cookie };
};

// Channel/Customer/Conversation seedados direto no model (@crm/db) — mesmo
// padrão de runTurn.int.test.ts (seedChannel), sem passar pelo channel.service
// (fora do escopo desta rota).
const seedConversationFixture = async (tenantId: string, overrides: Partial<Record<string, unknown>> = {}) => {
  const channel = await Channel.create({
    Tenant: tenantId,
    phoneNumberId: randomId(),
    accessTokenEnc: { ciphertext: 'c', iv: 'i', authTag: 'a' },
    status: 'active',
  });
  const customer = await Customer.create({
    Tenant: tenantId,
    name: 'Cliente Teste',
    phone: randomPhone(),
    template: randomId(),
    templateVersion: 1,
    values: {},
  });
  const conversation = await Conversation.create({
    Tenant: tenantId,
    Channel: channel._id,
    Customer: customer._id,
    mode: 'bot',
    ...overrides,
  });
  return { channel, customer, conversation };
};

describe('conversation routes', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
    await syncIndexes();
  });

  afterEach(async () => {
    await Promise.all([
      Message.deleteMany({}),
      Conversation.deleteMany({}),
      Customer.deleteMany({}),
      Channel.deleteMany({}),
      Session.deleteMany({}),
      User.deleteMany({}),
      Tenant.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await disconnect();
  });

  describe('POST /conversations/:id/takeover', () => {
    it("lets an operator of the tenant take over a Conversation: mode becomes 'human', assignee is recorded (AIG-31)", async () => {
      const { tenant, user, cookie } = await seedTenantUser(['operador']);
      const { conversation } = await seedConversationFixture(tenant._id.toString());
      const app = buildTestApp();

      const res = await request(app)
        .post(`/conversations/${conversation._id.toString()}/takeover`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(200);
      const persisted = await Conversation.findById(conversation._id).lean();
      expect(persisted?.mode).toBe('human');
      expect(persisted?.assignee?.toString()).toBe(user.id);
    });

    it("blocks the bot loop once mode is 'human': a real runTurn call for a customer message never reaches the model (AIG-32, T24 real)", async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const { channel, customer, conversation } = await seedConversationFixture(tenant._id.toString());
      const app = buildTestApp();
      const takeoverRes = await request(app)
        .post(`/conversations/${conversation._id.toString()}/takeover`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);
      expect(takeoverRes.status).toBe(200);

      const createMessage = vi.fn(
        async () =>
          ({
            content: [{ type: 'text', text: 'nunca deveria rodar' }],
            stop_reason: 'end_turn',
          }) as unknown as Promise<AnthropicMessage>,
      );
      const client: AnthropicClient = { createMessage };

      const result = await runTurn(client, {
        phoneNumberId: channel.phoneNumberId,
        wamid: `wamid-${randomId()}`,
        from: customer.phone,
        type: 'text',
        text: 'ainda preciso de ajuda',
      });

      expect(result).toEqual({ outcome: 'human_mode' });
      expect(createMessage).not.toHaveBeenCalled();
    });

    it('is idempotent: the same operator taking over again gets 200, not an error (spec.md INBOX-08/AC2)', async () => {
      const { tenant, user, cookie } = await seedTenantUser(['operador']);
      const { conversation } = await seedConversationFixture(tenant._id.toString(), {
        mode: 'human',
        assignee: user.id,
      });
      const app = buildTestApp();

      const res = await request(app)
        .post(`/conversations/${conversation._id.toString()}/takeover`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(200);
      const persisted = await Conversation.findById(conversation._id).lean();
      expect(persisted?.mode).toBe('human');
      expect(persisted?.assignee?.toString()).toBe(user.id);
    });

    it('responds 409 naming the current assignee when a DIFFERENT operator tries to take over (spec.md INBOX-08/AC3, context.md decision #6)', async () => {
      const { tenant, user: currentAssignee } = await seedTenantUser(['operador']);
      const { conversation } = await seedConversationFixture(tenant._id.toString(), {
        mode: 'human',
        assignee: currentAssignee._id,
      });
      // Segundo operador do MESMO tenant — User criado direto (seedTenantUser
      // sempre cria um Tenant novo, o que não serve aqui).
      const secondOperator = await User.create({
        name: 'Segundo Operador',
        email: `intruder-${randomId()}@empresa.com`,
        password: 'hash',
        Tenant: tenant._id,
        role: ['gestor'],
      });
      const secondCookie = await issueSessionCookie(secondOperator.id);
      const app = buildTestApp();

      const res = await request(app)
        .post(`/conversations/${conversation._id.toString()}/takeover`)
        .set('Cookie', secondCookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(409);
      expect(res.body.message).toContain(currentAssignee.name);
      const persisted = await Conversation.findById(conversation._id).lean();
      expect(persisted?.assignee?.toString()).toBe(currentAssignee.id);
    });
  });

  describe('POST /conversations/:id/release', () => {
    it("lets an operator release before the idle timeout: mode returns to 'bot' immediately (AIG-34)", async () => {
      const { tenant, cookie } = await seedTenantUser(['gestor']);
      const { conversation } = await seedConversationFixture(tenant._id.toString(), {
        mode: 'human',
        assignee: randomId(),
      });
      const app = buildTestApp();

      const res = await request(app)
        .post(`/conversations/${conversation._id.toString()}/release`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(200);
      const persisted = await Conversation.findById(conversation._id).lean();
      expect(persisted?.mode).toBe('bot');
      expect(persisted?.assignee).toBeFalsy();
    });

    it('releases even when the caller is NOT the current assignee — release stays unconditional for any canOperate (spec.md INBOX-09, regression)', async () => {
      const { tenant, user: assigneeUser } = await seedTenantUser(['operador']);
      const { conversation } = await seedConversationFixture(tenant._id.toString(), {
        mode: 'human',
        assignee: assigneeUser._id,
      });
      const otherOperator = await User.create({
        name: 'Outro Operador',
        email: `other-${randomId()}@empresa.com`,
        password: 'hash',
        Tenant: tenant._id,
        role: ['gestor'],
      });
      const otherCookie = await issueSessionCookie(otherOperator.id);
      const app = buildTestApp();

      const res = await request(app)
        .post(`/conversations/${conversation._id.toString()}/release`)
        .set('Cookie', otherCookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(200);
      const persisted = await Conversation.findById(conversation._id).lean();
      expect(persisted?.mode).toBe('bot');
      expect(persisted?.assignee).toBeFalsy();
    });
  });

  describe('POST /conversations/:id/messages', () => {
    it('creates Message{status:queued} for a manual send within the 24h window (AIG-36)', async () => {
      const { tenant, cookie } = await seedTenantUser(['admin']);
      const { conversation } = await seedConversationFixture(tenant._id.toString(), {
        windowExpiresAt: new Date(Date.now() + 60_000),
      });
      const app = buildTestApp();

      const res = await request(app)
        .post(`/conversations/${conversation._id.toString()}/messages`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ text: 'Olá, tudo certo?' });

      expect(res.status).toBe(201);
      const persisted = await Message.findOne({ Conversation: conversation._id, direction: 'out' }).lean();
      expect(persisted?.status).toBe('queued');
      expect(persisted?.text).toBe('Olá, tudo certo?');
    });

    it('rejects a free-text manual send outside the 24h window, queuing nothing (AIG-37)', async () => {
      const { tenant, cookie } = await seedTenantUser(['admin']);
      const { conversation } = await seedConversationFixture(tenant._id.toString(), {
        windowExpiresAt: new Date(Date.now() - 60_000),
      });
      const app = buildTestApp();

      const res = await request(app)
        .post(`/conversations/${conversation._id.toString()}/messages`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ text: 'Fora da janela' });

      expect(res.status).toBe(400);
      expect(await Message.countDocuments({ Conversation: conversation._id })).toBe(0);
    });

    it('always accepts a template send, even outside the 24h window (AIG-36)', async () => {
      const { tenant, cookie } = await seedTenantUser(['admin']);
      const { conversation } = await seedConversationFixture(tenant._id.toString(), {
        windowExpiresAt: new Date(Date.now() - 60_000),
      });
      const app = buildTestApp();

      const res = await request(app)
        .post(`/conversations/${conversation._id.toString()}/messages`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ templateName: 'confirmacao', templateLanguage: 'pt_BR', templateParams: { nome: 'Maria' } });

      expect(res.status).toBe(201);
      const persisted = await Message.findOne({ Conversation: conversation._id, direction: 'out' }).lean();
      expect(persisted?.status).toBe('queued');
      expect(persisted?.templateName).toBe('confirmacao');
    });
  });

  describe('POST /conversations/:id/messages/:messageId/resend (INBOX-14/16)', () => {
    const seedFailedMessage = async (
      tenantId: string,
      conversation: Awaited<ReturnType<typeof seedConversationFixture>>['conversation'],
      overrides: Partial<Record<string, unknown>> = {},
    ) =>
      Message.create({
        Tenant: tenantId,
        Conversation: conversation._id,
        Channel: conversation.Channel,
        Customer: conversation.Customer,
        direction: 'out',
        type: 'text',
        status: 'failed',
        text: 'mensagem que falhou',
        ...overrides,
      });

    it('creates the new Message and responds 201 with it, leaving the original failed Message untouched (spec.md INBOX-14)', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const { conversation } = await seedConversationFixture(tenant._id.toString());
      const original = await seedFailedMessage(tenant._id.toString(), conversation);
      const app = buildTestApp();

      const res = await request(app)
        .post(`/conversations/${conversation._id.toString()}/messages/${original.id}/resend`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(201);
      expect(res.body.data.id).not.toBe(original.id);
      expect(res.body.data.status).toBe('queued');
      expect(res.body.data.text).toBe('mensagem que falhou');
      const persistedOriginal = await Message.findById(original._id).lean();
      expect(persistedOriginal?.status).toBe('failed');
    });

    it('responds 400 when the Message is not status:failed (spec.md INBOX-16)', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const { conversation } = await seedConversationFixture(tenant._id.toString());
      const sent = await seedFailedMessage(tenant._id.toString(), conversation, { status: 'sent' });
      const app = buildTestApp();

      const res = await request(app)
        .post(`/conversations/${conversation._id.toString()}/messages/${sent.id}/resend`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(400);
      expect(await Message.countDocuments({})).toBe(1);
    });

    it("responds 404 for a non-existent messageId or one from another tenant's Conversation (spec.md INBOX-16)", async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const { conversation } = await seedConversationFixture(tenant._id.toString());
      const original = await seedFailedMessage(tenant._id.toString(), conversation);
      const app = buildTestApp();

      const notFoundRes = await request(app)
        .post(`/conversations/${conversation._id.toString()}/messages/${randomId()}/resend`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);
      expect(notFoundRes.status).toBe(404);

      const intruder = await seedTenantUser(['gestor']);
      const crossTenantRes = await request(app)
        .post(`/conversations/${conversation._id.toString()}/messages/${original.id}/resend`)
        .set('Cookie', intruder.cookie)
        .set('User-Agent', DEVICE);
      expect(crossTenantRes.status).toBe(404);
    });

    it('responds 403 for a caller without canOperate, resending nothing', async () => {
      const { tenant, cookie } = await seedTenantUser([]);
      const { conversation } = await seedConversationFixture(tenant._id.toString());
      const original = await seedFailedMessage(tenant._id.toString(), conversation);
      const app = buildTestApp();

      const res = await request(app)
        .post(`/conversations/${conversation._id.toString()}/messages/${original.id}/resend`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(403);
      expect(await Message.countDocuments({})).toBe(1);
    });
  });

  describe('tenant isolation across all 3 endpoints (AIG-35)', () => {
    it("responds 404 for another tenant's operator on takeover, leaving mode untouched", async () => {
      const owner = await seedTenantUser(['admin']);
      const { conversation } = await seedConversationFixture(owner.tenant._id.toString());
      const intruder = await seedTenantUser(['operador']);
      const app = buildTestApp();

      const res = await request(app)
        .post(`/conversations/${conversation._id.toString()}/takeover`)
        .set('Cookie', intruder.cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(404);
      const persisted = await Conversation.findById(conversation._id).lean();
      expect(persisted?.mode).toBe('bot');
      expect(persisted?.assignee).toBeFalsy();
    });

    it("responds 404 for another tenant's operator on release, leaving mode untouched", async () => {
      const owner = await seedTenantUser(['admin']);
      const { conversation } = await seedConversationFixture(owner.tenant._id.toString(), {
        mode: 'human',
        assignee: randomId(),
      });
      const intruder = await seedTenantUser(['operador']);
      const app = buildTestApp();

      const res = await request(app)
        .post(`/conversations/${conversation._id.toString()}/release`)
        .set('Cookie', intruder.cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(404);
      const persisted = await Conversation.findById(conversation._id).lean();
      expect(persisted?.mode).toBe('human');
    });

    it("responds 404 for another tenant's operator on manual send, queuing nothing", async () => {
      const owner = await seedTenantUser(['admin']);
      const { conversation } = await seedConversationFixture(owner.tenant._id.toString(), {
        windowExpiresAt: new Date(Date.now() + 60_000),
      });
      const intruder = await seedTenantUser(['operador']);
      const app = buildTestApp();

      const res = await request(app)
        .post(`/conversations/${conversation._id.toString()}/messages`)
        .set('Cookie', intruder.cookie)
        .set('User-Agent', DEVICE)
        .send({ text: 'invasor' });

      expect(res.status).toBe(404);
      expect(await Message.countDocuments({ Conversation: conversation._id })).toBe(0);
    });
  });

  describe('GET /conversations (INBOX-01/02/03)', () => {
    // Channel.Tenant é único e Conversation{Channel,Customer} também
    // (packages/db) — vários seeds no MESMO tenant reusam um único Channel e
    // criam um Customer novo por conversa (mesmo padrão de
    // conversation.repository.int.test.ts, T7).
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
          phone: randomPhone(),
          template: randomId(),
          templateVersion: 1,
          values: {},
        });
        conversations.push(
          await Conversation.create({ Tenant: tenantId, Channel: channel._id, Customer: customer._id, ...overrides }),
        );
      }
      return conversations;
    };

    it('responds 200 with the paginated list scoped to the session tenant (never another tenant)', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const { conversation } = await seedConversationFixture(tenant._id.toString());
      const other = await seedTenantUser(['admin']);
      await seedConversationFixture(other.tenant._id.toString());
      const app = buildTestApp();

      const res = await request(app).get('/conversations').set('Cookie', cookie).set('User-Agent', DEVICE);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.items.map((item: { id: string }) => item.id)).toEqual([conversation._id.toString()]);
    });

    it('responds 403 for a caller without canOperate, without returning any conversation data', async () => {
      const { tenant, cookie } = await seedTenantUser([]);
      await seedConversationFixture(tenant._id.toString());
      const app = buildTestApp();

      const res = await request(app).get('/conversations').set('Cookie', cookie).set('User-Agent', DEVICE);

      expect(res.status).toBe(403);
      expect(res.body.data).toBeUndefined();
    });

    it('accepts mode/assignee query filters and passes them through to the repository', async () => {
      const { tenant, cookie } = await seedTenantUser(['gestor']);
      const [humanConversation] = await seedConversationsForTenant(tenant._id.toString(), [
        { mode: 'human', assignee: randomId() },
        { mode: 'bot' },
      ]);
      const app = buildTestApp();

      const res = await request(app)
        .get('/conversations')
        .query({ mode: 'human' })
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.items.map((item: { id: string }) => item.id)).toEqual([humanConversation._id.toString()]);
    });
  });

  describe('GET /conversations/:id/messages (INBOX-05/06)', () => {
    it("responds 200 with the Conversation's message history, in chronological order (spec.md INBOX-05/AC1)", async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const { conversation } = await seedConversationFixture(tenant._id.toString());
      const first = await Message.create({
        Tenant: tenant._id,
        Conversation: conversation._id,
        Channel: conversation.Channel,
        Customer: conversation.Customer,
        direction: 'in',
        type: 'text',
        text: 'primeira',
        createdAt: new Date('2026-01-01T00:01:00.000Z'),
      });
      const second = await Message.create({
        Tenant: tenant._id,
        Conversation: conversation._id,
        Channel: conversation.Channel,
        Customer: conversation.Customer,
        direction: 'out',
        type: 'text',
        status: 'sent',
        text: 'segunda',
        createdAt: new Date('2026-01-01T00:02:00.000Z'),
      });
      const app = buildTestApp();

      const res = await request(app)
        .get(`/conversations/${conversation._id.toString()}/messages`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(2);
      expect(res.body.data.items.map((item: { id: string }) => item.id)).toEqual([
        first._id.toString(),
        second._id.toString(),
      ]);
    });

    it("responds 404 for another tenant's Conversation (spec.md INBOX-05/AC2)", async () => {
      const owner = await seedTenantUser(['admin']);
      const { conversation } = await seedConversationFixture(owner.tenant._id.toString());
      const intruder = await seedTenantUser(['operador']);
      const app = buildTestApp();

      const res = await request(app)
        .get(`/conversations/${conversation._id.toString()}/messages`)
        .set('Cookie', intruder.cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(404);
    });

    it('responds 404 for a non-existent Conversation id (spec.md INBOX-05/AC2)', async () => {
      const { cookie } = await seedTenantUser(['admin']);
      const app = buildTestApp();

      const res = await request(app)
        .get(`/conversations/${randomId()}/messages`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(404);
    });

    it('responds 403 for a caller without canOperate, without returning any message data', async () => {
      const { tenant, cookie } = await seedTenantUser([]);
      const { conversation } = await seedConversationFixture(tenant._id.toString());
      const app = buildTestApp();

      const res = await request(app)
        .get(`/conversations/${conversation._id.toString()}/messages`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(403);
      expect(res.body.data).toBeUndefined();
    });
  });
});
