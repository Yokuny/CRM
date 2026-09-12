import crypto from 'node:crypto';
import type { Role } from '@crm/contracts';
import { connect, disconnect, hashToken, SchedulingSettings, Session, syncIndexes, Tenant, User } from '@crm/db';
import cookieParser from 'cookie-parser';
import express from 'express';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../config/env.config.js';
import type { AuthDeps } from '../middlewares/authentication.middleware.js';
import { createAuthMiddleware } from '../middlewares/authentication.middleware.js';
import { errorHandler } from '../middlewares/errorHandler.middleware.js';
import { createSchedulingSettingsRouter } from './schedulingSettings.router.js';

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
  app.use('/scheduling-settings', createSchedulingSettingsRouter({ validToken }));
  app.use(errorHandler);
  return app;
};

// Cada teste recebe seu PRÓPRIO Tenant — mesmo padrão de
// product.router.e2e.test.ts (isolamento entre casos deste arquivo).
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

describe('scheduling-settings routes', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
    await syncIndexes();
  });

  afterEach(async () => {
    await Promise.all([
      SchedulingSettings.deleteMany({}),
      Session.deleteMany({}),
      User.deleteMany({}),
      Tenant.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await disconnect();
  });

  describe('GET /scheduling-settings (spec.md SCH-06)', () => {
    it('responds 200 with {maxSlotsPerResponse: 16} when the tenant never configured it', async () => {
      const { cookie } = await seedTenantUser(['operador']);
      const app = buildTestApp();

      const res = await request(app).get('/scheduling-settings').set('Cookie', cookie).set('User-Agent', DEVICE);

      expect(res.status).toBe(200);
      expect(res.body.data.maxSlotsPerResponse).toBe(16);
    });

    it('responds 403 for a caller without canOperate (spec.md SCH-07)', async () => {
      const { cookie } = await seedTenantUser([]);
      const app = buildTestApp();

      const res = await request(app).get('/scheduling-settings').set('Cookie', cookie).set('User-Agent', DEVICE);

      expect(res.status).toBe(403);
      expect(res.body.data).toBeUndefined();
    });
  });

  describe('PUT /scheduling-settings (spec.md SCH-06)', () => {
    it('sets maxSlotsPerResponse to 10, and a subsequent GET reflects it', async () => {
      const { tenant, cookie } = await seedTenantUser(['gestor']);
      const app = buildTestApp();

      const putRes = await request(app)
        .put('/scheduling-settings')
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ maxSlotsPerResponse: 10 });

      expect(putRes.status).toBe(200);
      expect(putRes.body.data.maxSlotsPerResponse).toBe(10);
      const persisted = await SchedulingSettings.findOne({ Tenant: tenant._id }).lean();
      expect(persisted?.maxSlotsPerResponse).toBe(10);

      const getRes = await request(app).get('/scheduling-settings').set('Cookie', cookie).set('User-Agent', DEVICE);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.maxSlotsPerResponse).toBe(10);
    });

    it('responds 400 for maxSlotsPerResponse:0, without persisting anything (spec.md SCH-06)', async () => {
      const { cookie } = await seedTenantUser(['gestor']);
      const app = buildTestApp();

      const res = await request(app)
        .put('/scheduling-settings')
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ maxSlotsPerResponse: 0 });

      expect(res.status).toBe(400);
      expect(await SchedulingSettings.countDocuments({})).toBe(0);
    });

    it('responds 400 for maxSlotsPerResponse:51, without persisting anything (spec.md SCH-06)', async () => {
      const { cookie } = await seedTenantUser(['gestor']);
      const app = buildTestApp();

      const res = await request(app)
        .put('/scheduling-settings')
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ maxSlotsPerResponse: 51 });

      expect(res.status).toBe(400);
      expect(await SchedulingSettings.countDocuments({})).toBe(0);
    });

    it('responds 403 for a caller without canOperate, without persisting anything (spec.md SCH-07)', async () => {
      const { cookie } = await seedTenantUser([]);
      const app = buildTestApp();

      const res = await request(app)
        .put('/scheduling-settings')
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ maxSlotsPerResponse: 10 });

      expect(res.status).toBe(403);
      expect(await SchedulingSettings.countDocuments({})).toBe(0);
    });
  });
});
