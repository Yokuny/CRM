import { connect, disconnect, hashToken, Session, Tenant, User } from '@crm/db';
import bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { AuthDeps } from '../middlewares/authentication.middleware.js';
import { createAuthMiddleware } from '../middlewares/authentication.middleware.js';
import { errorHandler } from '../middlewares/errorHandler.middleware.js';
import { createAuthRouter } from './auth.router.js';

// SPEC_DEVIATION: mesma razão de platform.router.int.test.ts (suffix
// `.int.test.ts` em vez de `.e2e.test.ts` — project "e2e" não tem Mongo real).
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

const buildTestApp = () => {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  const { validToken } = createAuthMiddleware(buildAuthDeps());
  app.use('/auth', createAuthRouter({ validToken }));
  app.use(errorHandler);
  return app;
};

const DEVICE = 'test-agent';

describe('auth routes', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
  });

  afterEach(async () => {
    await Promise.all([Session.deleteMany({}), User.deleteMany({}), Tenant.deleteMany({})]);
  });

  afterAll(async () => {
    await disconnect();
  });

  const seedUser = async (overrides: { active?: boolean } = {}) => {
    const tenant = await Tenant.create({ name: 'Empresa Login', document: '55555555000155', status: 'active' });
    const hashed = await bcrypt.hash('senhaCorreta123', 10);
    const user = await User.create({
      name: 'Usuária Login',
      email: 'login@empresa.com',
      password: hashed,
      Tenant: tenant._id,
      role: ['gestor'],
      active: overrides.active ?? true,
    });
    return { tenant, user };
  };

  describe('POST /auth/signin', () => {
    it('sets an httpOnly refreshToken cookie and persists a matching Session on correct credentials (FND-04)', async () => {
      const { user } = await seedUser();

      const res = await request(buildTestApp())
        .post('/auth/signin')
        .set('User-Agent', DEVICE)
        .send({ email: 'login@empresa.com', password: 'senhaCorreta123' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: undefined, message: expect.stringMatching(/sucesso/i) });

      const setCookie = res.headers['set-cookie'] as unknown as string[];
      expect(setCookie?.[0]).toMatch(/refreshToken=/);
      expect(setCookie?.[0]).toMatch(/HttpOnly/i);

      const rawToken = setCookie[0].split(';')[0].split('=')[1];
      const session = await Session.findOne({ tokenHash: hashToken(rawToken) }).lean();
      expect(session).not.toBeNull();
      expect(session?.user.toString()).toBe(user.id);
      expect(session?.deviceInfo).toBe(DEVICE);
    });

    it('responds 401 and creates no session on wrong password (FND-04)', async () => {
      await seedUser();

      const res = await request(buildTestApp())
        .post('/auth/signin')
        .set('User-Agent', DEVICE)
        .send({ email: 'login@empresa.com', password: 'senhaErrada' });

      expect(res.status).toBe(401);
      expect(await Session.countDocuments({})).toBe(0);
    });

    it('never 401s on GET /auth/session called immediately after signin in the same sequence (Risk 5 — awaited session write)', async () => {
      await seedUser();
      const app = buildTestApp();

      const signinRes = await request(app)
        .post('/auth/signin')
        .set('User-Agent', DEVICE)
        .send({ email: 'login@empresa.com', password: 'senhaCorreta123' });
      const cookie = (signinRes.headers['set-cookie'] as unknown as string[])[0].split(';')[0];

      const sessionRes = await request(app).get('/auth/session').set('Cookie', cookie).set('User-Agent', DEVICE);

      expect(sessionRes.status).not.toBe(401);
      expect(sessionRes.status).toBe(200);
    });
  });

  describe('GET /auth/session', () => {
    it("returns {tenant,user,role} read from the database — a live update to the user's name/tenant status is reflected (FND-05)", async () => {
      const { tenant, user } = await seedUser();
      const app = buildTestApp();

      const signinRes = await request(app)
        .post('/auth/signin')
        .set('User-Agent', DEVICE)
        .send({ email: 'login@empresa.com', password: 'senhaCorreta123' });
      const cookie = (signinRes.headers['set-cookie'] as unknown as string[])[0].split(';')[0];

      // Muda o estado no banco DEPOIS de emitida a sessão — se a resposta
      // vier do payload do token (ou de algo cacheado), o valor antigo
      // apareceria; vindo do banco, reflete a mudança.
      await User.findByIdAndUpdate(user._id, { name: 'Nome Atualizado' });
      await Tenant.findByIdAndUpdate(tenant._id, { status: 'suspended' });

      const res = await request(app).get('/auth/session').set('Cookie', cookie).set('User-Agent', DEVICE);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        tenant: { id: tenant.id, name: 'Empresa Login', status: 'suspended' },
        user: { id: user.id, name: 'Nome Atualizado', email: 'login@empresa.com' },
        role: ['gestor'],
      });
    });

    it('responds 401 without a valid session cookie', async () => {
      const res = await request(buildTestApp()).get('/auth/session').set('User-Agent', DEVICE);

      expect(res.status).toBe(401);
    });
  });
});
