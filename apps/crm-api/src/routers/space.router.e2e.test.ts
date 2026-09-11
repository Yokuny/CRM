import crypto from 'node:crypto';
import type { Role } from '@crm/contracts';
import { connect, disconnect, hashToken, Session, Space, syncIndexes, Tenant, User } from '@crm/db';
import cookieParser from 'cookie-parser';
import express from 'express';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../config/env.config.js';
import type { AuthDeps } from '../middlewares/authentication.middleware.js';
import { createAuthMiddleware } from '../middlewares/authentication.middleware.js';
import { errorHandler } from '../middlewares/errorHandler.middleware.js';
import { createSpaceRouter } from './space.router.js';

const DEVICE = 'test-agent';

// Sem `mongoose` aqui (AD-010/boundary estrutural: só packages/db importa
// mongoose) — mesmo padrão de product.router.e2e.test.ts.
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
  app.use('/spaces', createSpaceRouter({ validToken }));
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

describe('space routes', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
    await syncIndexes();
  });

  afterEach(async () => {
    await Promise.all([Space.deleteMany({}), Session.deleteMany({}), User.deleteMany({}), Tenant.deleteMany({})]);
  });

  afterAll(async () => {
    await disconnect();
  });

  describe('POST /spaces (spec.md P1 "Configuração de agenda"/SCH-04)', () => {
    it('creates a Space scoped to the session Tenant, with active defaulting to true', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const app = buildTestApp();

      const res = await request(app)
        .post('/spaces')
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ name: 'Sala 1' });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Sala 1');
      expect(res.body.data.active).toBe(true);
      const persisted = await Space.findById(res.body.data.id).lean();
      expect(persisted?.Tenant.toString()).toBe(tenant._id.toString());
    });

    it('responds 400 for an empty name, creating nothing (spec.md SCH-04)', async () => {
      const { cookie } = await seedTenantUser(['operador']);
      const app = buildTestApp();

      const res = await request(app)
        .post('/spaces')
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ name: '' });

      expect(res.status).toBe(400);
      expect(await Space.countDocuments({})).toBe(0);
    });

    it('responds 403 for a caller without canOperate, creating nothing (spec.md SCH-07)', async () => {
      const { cookie } = await seedTenantUser([]);
      const app = buildTestApp();

      const res = await request(app)
        .post('/spaces')
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ name: 'Sala 1' });

      expect(res.status).toBe(403);
      expect(await Space.countDocuments({})).toBe(0);
    });
  });

  describe('GET /spaces', () => {
    it('responds 200 with the paginated list scoped to the session tenant (never another tenant)', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      await Space.create({ Tenant: tenant._id, name: 'Minha Sala' });
      const other = await seedTenantUser(['admin']);
      await Space.create({ Tenant: other.tenant._id, name: 'De Outro Tenant' });
      const app = buildTestApp();

      const res = await request(app).get('/spaces').set('Cookie', cookie).set('User-Agent', DEVICE);

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.items.map((item: { name: string }) => item.name)).toEqual(['Minha Sala']);
    });

    it('responds 403 for a caller without canOperate, without returning any space data (spec.md SCH-07)', async () => {
      const { tenant, cookie } = await seedTenantUser([]);
      await Space.create({ Tenant: tenant._id, name: 'Sala 1' });
      const app = buildTestApp();

      const res = await request(app).get('/spaces').set('Cookie', cookie).set('User-Agent', DEVICE);

      expect(res.status).toBe(403);
      expect(res.body.data).toBeUndefined();
    });
  });

  describe('GET /spaces/:id', () => {
    it('responds 200 with the Space for its own tenant', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const space = await Space.create({ Tenant: tenant._id, name: 'Sala 1' });
      const app = buildTestApp();

      const res = await request(app).get(`/spaces/${space._id.toString()}`).set('Cookie', cookie).set('User-Agent', DEVICE);

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Sala 1');
    });

    it("responds 404 for an id belonging to another tenant's Space", async () => {
      const { cookie } = await seedTenantUser(['operador']);
      const owner = await seedTenantUser(['admin']);
      const space = await Space.create({ Tenant: owner.tenant._id, name: 'Sala 1' });
      const app = buildTestApp();

      const res = await request(app).get(`/spaces/${space._id.toString()}`).set('Cookie', cookie).set('User-Agent', DEVICE);

      expect(res.status).toBe(404);
    });

    it('responds 403 for a caller without canOperate (spec.md SCH-07)', async () => {
      const { tenant, cookie } = await seedTenantUser([]);
      const space = await Space.create({ Tenant: tenant._id, name: 'Sala 1' });
      const app = buildTestApp();

      const res = await request(app).get(`/spaces/${space._id.toString()}`).set('Cookie', cookie).set('User-Agent', DEVICE);

      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /spaces/:id', () => {
    it('updates only the fields informed, leaving the rest untouched', async () => {
      const { tenant, cookie } = await seedTenantUser(['gestor']);
      const space = await Space.create({ Tenant: tenant._id, name: 'Sala Original' });
      const app = buildTestApp();

      const res = await request(app)
        .patch(`/spaces/${space._id.toString()}`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ active: false });

      expect(res.status).toBe(200);
      expect(res.body.data.active).toBe(false);
      expect(res.body.data.name).toBe('Sala Original');
    });

    it('responds 400 for an empty name, leaving the Space untouched (spec.md SCH-04)', async () => {
      const { tenant, cookie } = await seedTenantUser(['gestor']);
      const space = await Space.create({ Tenant: tenant._id, name: 'Sala Original' });
      const app = buildTestApp();

      const res = await request(app)
        .patch(`/spaces/${space._id.toString()}`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ name: '' });

      expect(res.status).toBe(400);
      const persisted = await Space.findById(space._id).lean();
      expect(persisted?.name).toBe('Sala Original');
    });

    it("responds 404 for an id belonging to another tenant's Space", async () => {
      const { cookie } = await seedTenantUser(['gestor']);
      const owner = await seedTenantUser(['admin']);
      const space = await Space.create({ Tenant: owner.tenant._id, name: 'Sala 1' });
      const app = buildTestApp();

      const res = await request(app)
        .patch(`/spaces/${space._id.toString()}`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ active: false });

      expect(res.status).toBe(404);
    });

    it('responds 403 for a caller without canOperate, leaving the Space untouched (spec.md SCH-07)', async () => {
      const { tenant, cookie } = await seedTenantUser([]);
      const space = await Space.create({ Tenant: tenant._id, name: 'Sala 1' });
      const app = buildTestApp();

      const res = await request(app)
        .patch(`/spaces/${space._id.toString()}`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ active: false });

      expect(res.status).toBe(403);
      const persisted = await Space.findById(space._id).lean();
      expect(persisted?.active).toBe(true);
    });
  });
});
