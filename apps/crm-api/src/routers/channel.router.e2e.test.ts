import crypto from 'node:crypto';
import type { Role } from '@crm/contracts';
import { Channel, connect, disconnect, hashToken, Session, syncIndexes, Tenant, User } from '@crm/db';
import cookieParser from 'cookie-parser';
import express from 'express';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../config/env.config.js';
import type { AuthDeps } from '../middlewares/authentication.middleware.js';
import { createAuthMiddleware } from '../middlewares/authentication.middleware.js';
import { errorHandler } from '../middlewares/errorHandler.middleware.js';
import { createChannelRouter } from './channel.router.js';

const DEVICE = 'test-agent';

// Sem `mongoose` aqui (AD-010/boundary estrutural: só packages/db importa
// mongoose) — mesmo padrão de customer.router.e2e.test.ts.
const randomId = (): string => crypto.randomBytes(12).toString('hex');

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
  app.use('/channels', createChannelRouter({ validToken }));
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

const createChannelReq = (app: express.Express, cookie: string, body: object) =>
  request(app).post('/channels').set('Cookie', cookie).set('User-Agent', DEVICE).send(body);

const getCurrentChannelReq = (app: express.Express, cookie: string) =>
  request(app).get('/channels/current').set('Cookie', cookie).set('User-Agent', DEVICE);

describe('channel routes', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
    await syncIndexes();
  });

  afterEach(async () => {
    await Promise.all([Channel.deleteMany({}), Session.deleteMany({}), User.deleteMany({}), Tenant.deleteMany({})]);
  });

  afterAll(async () => {
    await disconnect();
  });

  describe('POST /channels', () => {
    it('lets an admin create a Channel (201) — the access token never appears in clear in the response (AIG-01)', async () => {
      const { tenant, cookie } = await seedTenantUser(['admin']);
      const app = buildTestApp();

      const res = await createChannelReq(app, cookie, {
        phoneNumberId: randomId(),
        accessToken: 'EAABsecret-token-value-12345',
      });

      expect(res.status).toBe(201);
      expect(res.body.data.accessToken).toBe('****2345');
      expect(res.body.data).not.toHaveProperty('accessTokenEnc');
      const persisted = await Channel.findOne({ Tenant: tenant._id }).lean();
      expect(persisted?.Tenant.toString()).toBe(tenant.id);
      expect(persisted?.accessTokenEnc.ciphertext).not.toBe('EAABsecret-token-value-12345');
    });

    it('responds 409 for a duplicate phoneNumberId, creating nothing new (AIG-02)', async () => {
      const first = await seedTenantUser(['admin']);
      const second = await seedTenantUser(['admin']);
      const app = buildTestApp();
      const phoneNumberId = randomId();
      await createChannelReq(app, first.cookie, { phoneNumberId, accessToken: 'token-um' });

      const res = await createChannelReq(app, second.cookie, { phoneNumberId, accessToken: 'token-dois' });

      expect(res.status).toBe(409);
      expect(await Channel.countDocuments({ phoneNumberId })).toBe(1);
    });

    it('rejects a body carrying a forged Tenant/tenantId/orgId key — Tenant always comes from the session (AIG-03, schema is strict)', async () => {
      const { cookie } = await seedTenantUser(['admin']);
      const app = buildTestApp();

      const res = await createChannelReq(app, cookie, {
        phoneNumberId: randomId(),
        accessToken: 'token',
        tenantId: '65b0f3e2a1c4d5e6f7081920',
      });

      expect(res.status).toBe(400);
      expect(await Channel.countDocuments()).toBe(0);
    });

    it('responds 403 for a non-admin role of the same tenant, creating nothing (AIG-04)', async () => {
      const gestor = await seedTenantUser(['gestor']);
      const operador = await seedTenantUser(['operador']);
      const app = buildTestApp();

      const asGestor = await createChannelReq(app, gestor.cookie, {
        phoneNumberId: randomId(),
        accessToken: 'token',
      });
      const asOperador = await createChannelReq(app, operador.cookie, {
        phoneNumberId: randomId(),
        accessToken: 'token',
      });

      expect(asGestor.status).toBe(403);
      expect(asOperador.status).toBe(403);
      expect(await Channel.countDocuments()).toBe(0);
    });
  });

  describe('GET /channels/current', () => {
    it("returns the session tenant's Channel, masked (AIG-01)", async () => {
      const { tenant, cookie } = await seedTenantUser(['admin']);
      const app = buildTestApp();
      const created = await createChannelReq(app, cookie, {
        phoneNumberId: randomId(),
        accessToken: 'EAABsecret-token-value-12345',
      });

      const res = await getCurrentChannelReq(app, cookie);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(created.body.data.id);
      expect(res.body.data.tenant).toBe(tenant.id);
      expect(res.body.data.accessToken).toBe('****2345');
    });

    it("never returns another tenant's Channel (AD-010)", async () => {
      const tenantA = await seedTenantUser(['admin']);
      const tenantB = await seedTenantUser(['admin']);
      const app = buildTestApp();
      await createChannelReq(app, tenantA.cookie, { phoneNumberId: randomId(), accessToken: 'token-a' });

      const res = await getCurrentChannelReq(app, tenantB.cookie);

      expect(res.status).toBe(404);
    });
  });
});
