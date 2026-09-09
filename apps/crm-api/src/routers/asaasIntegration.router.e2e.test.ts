import crypto from 'node:crypto';
import type { Role } from '@crm/contracts';
import { AsaasIntegration, connect, disconnect, hashToken, Session, syncIndexes, Tenant, User } from '@crm/db';
import cookieParser from 'cookie-parser';
import express from 'express';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../config/env.config.js';
import type { AuthDeps } from '../middlewares/authentication.middleware.js';
import { createAuthMiddleware } from '../middlewares/authentication.middleware.js';
import { errorHandler } from '../middlewares/errorHandler.middleware.js';
import { createAsaasIntegrationRouter } from './asaasIntegration.router.js';

const validateApiKeyMock = vi.fn();
const registerWebhookMock = vi.fn();

// Sem network real (Test Coverage Matrix: "fake fetch injected, never real
// network") — o provider real é o único ponto de saída ao Asaas
// (asaasIntegration.service.ts o importa diretamente), então o e2e desta
// rota substitui o módulo inteiro em vez de mockar `fetch`.
vi.mock('../providers/asaasClient.js', () => ({
  validateApiKey: (...args: unknown[]) => validateApiKeyMock(...args),
  registerWebhook: (...args: unknown[]) => registerWebhookMock(...args),
}));

const DEVICE = 'test-agent';

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
  app.use('/asaas-integrations', createAsaasIntegrationRouter({ validToken }));
  app.use(errorHandler);
  return app;
};

// Cada teste recebe seu PRÓPRIO Tenant — mesmo padrão de
// channel.router.e2e.test.ts (isolamento entre casos deste arquivo).
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

const VALID_KEY = '$aact_hmlg_valid-key-1234567890abcdef';

const createIntegrationReq = (app: express.Express, cookie: string, body: object) =>
  request(app).post('/asaas-integrations').set('Cookie', cookie).set('User-Agent', DEVICE).send(body);

const getCurrentIntegrationReq = (app: express.Express, cookie: string) =>
  request(app).get('/asaas-integrations/current').set('Cookie', cookie).set('User-Agent', DEVICE);

describe('asaasIntegration routes (spec.md P1 "Tenant configura sua própria chave Asaas")', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
    await syncIndexes();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await Promise.all([
      AsaasIntegration.deleteMany({}),
      Session.deleteMany({}),
      User.deleteMany({}),
      Tenant.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await disconnect();
  });

  describe('POST /asaas-integrations', () => {
    it('lets an admin create an integration (201) — the apiKey never appears in clear in the response (AC1/AC3)', async () => {
      validateApiKeyMock.mockResolvedValueOnce(true);
      registerWebhookMock.mockResolvedValueOnce({ asaasWebhookId: 'wh_1' });
      const { tenant, cookie } = await seedTenantUser(['admin']);
      const app = buildTestApp();

      const res = await createIntegrationReq(app, cookie, { apiKey: VALID_KEY });

      expect(res.status).toBe(201);
      expect(res.body.data.apiKey).toBe('****cdef');
      expect(res.body.data.environment).toBe('sandbox');
      expect(res.body.data).not.toHaveProperty('apiKeyEnc');
      const persisted = await AsaasIntegration.findOne({ Tenant: tenant._id }).lean();
      expect(persisted?.Tenant.toString()).toBe(tenant.id);
      expect(persisted?.apiKeyEnc.ciphertext).not.toBe(VALID_KEY);
      expect(persisted?.webhookAuthTokenHash).toBeTruthy();
    });

    it('rejects an Asaas-rejected key with a 4xx, persisting nothing and never registering a webhook (AC2)', async () => {
      validateApiKeyMock.mockResolvedValueOnce(false);
      const { cookie } = await seedTenantUser(['admin']);
      const app = buildTestApp();

      const res = await createIntegrationReq(app, cookie, { apiKey: VALID_KEY });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(registerWebhookMock).not.toHaveBeenCalled();
      expect(await AsaasIntegration.countDocuments()).toBe(0);
    });

    it('responds 403 for a non-admin role of the same tenant, creating nothing and calling no Asaas API (AC gate before DB/body work)', async () => {
      const gestor = await seedTenantUser(['gestor']);
      const operador = await seedTenantUser(['operador']);
      const app = buildTestApp();

      const asGestor = await createIntegrationReq(app, gestor.cookie, { apiKey: VALID_KEY });
      const asOperador = await createIntegrationReq(app, operador.cookie, { apiKey: VALID_KEY });

      expect(asGestor.status).toBe(403);
      expect(asOperador.status).toBe(403);
      expect(validateApiKeyMock).not.toHaveBeenCalled();
      expect(await AsaasIntegration.countDocuments()).toBe(0);
    });

    it('responds 403 (not 400) for a non-admin even with a malformed body — isAdmin runs before body validation', async () => {
      const gestor = await seedTenantUser(['gestor']);
      const app = buildTestApp();

      const res = await createIntegrationReq(app, gestor.cookie, { apiKey: '' });

      expect(res.status).toBe(403);
    });

    it('rejects a malformed apiKey with 400 via the contracts schema, persisting nothing (T9 wired through validBody)', async () => {
      const { cookie } = await seedTenantUser(['admin']);
      const app = buildTestApp();

      const res = await createIntegrationReq(app, cookie, { apiKey: 'not-an-asaas-key' });

      expect(res.status).toBe(400);
      expect(validateApiKeyMock).not.toHaveBeenCalled();
      expect(await AsaasIntegration.countDocuments()).toBe(0);
    });

    it('rejects a body carrying a forged Tenant key — Tenant always comes from the session (schema is strict)', async () => {
      const { cookie } = await seedTenantUser(['admin']);
      const app = buildTestApp();

      const res = await createIntegrationReq(app, cookie, { apiKey: VALID_KEY, tenantId: '65b0f3e2a1c4d5e6f7081920' });

      expect(res.status).toBe(400);
      expect(await AsaasIntegration.countDocuments()).toBe(0);
    });
  });

  describe('GET /asaas-integrations/current', () => {
    it("returns the session tenant's integration, masked (AC3)", async () => {
      validateApiKeyMock.mockResolvedValueOnce(true);
      registerWebhookMock.mockResolvedValueOnce({ asaasWebhookId: 'wh_2' });
      const { tenant, cookie } = await seedTenantUser(['admin']);
      const app = buildTestApp();
      const created = await createIntegrationReq(app, cookie, { apiKey: VALID_KEY });

      const res = await getCurrentIntegrationReq(app, cookie);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(created.body.data.id);
      expect(res.body.data.tenant).toBe(tenant.id);
      expect(res.body.data.apiKey).toBe('****cdef');
    });

    it("never returns another tenant's integration (AD-010)", async () => {
      validateApiKeyMock.mockResolvedValueOnce(true);
      registerWebhookMock.mockResolvedValueOnce({ asaasWebhookId: 'wh_3' });
      const tenantA = await seedTenantUser(['admin']);
      const tenantB = await seedTenantUser(['admin']);
      const app = buildTestApp();
      await createIntegrationReq(app, tenantA.cookie, { apiKey: VALID_KEY });

      const res = await getCurrentIntegrationReq(app, tenantB.cookie);

      expect(res.status).toBe(404);
    });

    it('responds 403 for a non-admin role, never reaching the service/DB', async () => {
      const operador = await seedTenantUser(['operador']);
      const app = buildTestApp();

      const res = await getCurrentIntegrationReq(app, operador.cookie);

      expect(res.status).toBe(403);
    });
  });
});
