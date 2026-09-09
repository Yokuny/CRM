import crypto from 'node:crypto';
import type { Role } from '@crm/contracts';
import { connect, disconnect, hashToken, Product, Session, syncIndexes, Tenant, User } from '@crm/db';
import cookieParser from 'cookie-parser';
import express from 'express';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../config/env.config.js';
import type { AuthDeps } from '../middlewares/authentication.middleware.js';
import { createAuthMiddleware } from '../middlewares/authentication.middleware.js';
import { errorHandler } from '../middlewares/errorHandler.middleware.js';
import { createProductRouter } from './product.router.js';

const DEVICE = 'test-agent';

// Sem `mongoose` aqui (AD-010/boundary estrutural: só packages/db importa
// mongoose) — mesmo padrão de conversation.router.e2e.test.ts.
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
  app.use('/products', createProductRouter({ validToken }));
  app.use(errorHandler);
  return app;
};

// Cada teste recebe seu PRÓPRIO Tenant — mesmo padrão de
// conversation.router.e2e.test.ts (isolamento entre casos deste arquivo).
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

describe('product routes', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
    await syncIndexes();
  });

  afterEach(async () => {
    await Promise.all([Product.deleteMany({}), Session.deleteMany({}), User.deleteMany({}), Tenant.deleteMany({})]);
  });

  afterAll(async () => {
    await disconnect();
  });

  describe('POST /products (spec.md P1 "Cadastro de catálogo"/AC1)', () => {
    it('creates a Product scoped to the session Tenant, with active defaulting to true', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const app = buildTestApp();

      const res = await request(app)
        .post('/products')
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ name: 'Camiseta Azul', price: 4990, stock: 10 });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Camiseta Azul');
      expect(res.body.data.active).toBe(true);
      const persisted = await Product.findById(res.body.data.id).lean();
      expect(persisted?.Tenant.toString()).toBe(tenant._id.toString());
    });

    it('responds 400 for a negative price, creating nothing (spec.md AC4)', async () => {
      const { cookie } = await seedTenantUser(['operador']);
      const app = buildTestApp();

      const res = await request(app)
        .post('/products')
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ name: 'Produto', price: -1, stock: 5 });

      expect(res.status).toBe(400);
      expect(await Product.countDocuments({})).toBe(0);
    });

    it('responds 403 for a caller without canOperate, creating nothing (spec.md AC5)', async () => {
      const { cookie } = await seedTenantUser([]);
      const app = buildTestApp();

      const res = await request(app)
        .post('/products')
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ name: 'Produto', price: 1000, stock: 5 });

      expect(res.status).toBe(403);
      expect(await Product.countDocuments({})).toBe(0);
    });
  });

  describe('GET /products (spec.md P1 "Cadastro de catálogo"/AC2)', () => {
    it('responds 200 with the paginated list scoped to the session tenant (never another tenant)', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      await Product.create({ Tenant: tenant._id, name: 'Meu Produto', price: 1000, stock: 5 });
      const other = await seedTenantUser(['admin']);
      await Product.create({ Tenant: other.tenant._id, name: 'De Outro Tenant', price: 1000, stock: 5 });
      const app = buildTestApp();

      const res = await request(app).get('/products').set('Cookie', cookie).set('User-Agent', DEVICE);

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.items.map((item: { name: string }) => item.name)).toEqual(['Meu Produto']);
    });

    it('responds 403 for a caller without canOperate, without returning any product data', async () => {
      const { tenant, cookie } = await seedTenantUser([]);
      await Product.create({ Tenant: tenant._id, name: 'Produto', price: 1000, stock: 5 });
      const app = buildTestApp();

      const res = await request(app).get('/products').set('Cookie', cookie).set('User-Agent', DEVICE);

      expect(res.status).toBe(403);
      expect(res.body.data).toBeUndefined();
    });
  });

  describe('PATCH /products/:id (spec.md P1 "Cadastro de catálogo"/AC3)', () => {
    it('updates only the fields informed, without affecting Orders that reference it (spec.md AC3 — no Order in this batch, so just the field-scoping half)', async () => {
      const { tenant, cookie } = await seedTenantUser(['gestor']);
      const product = await Product.create({ Tenant: tenant._id, name: 'Produto Original', price: 1000, stock: 5 });
      const app = buildTestApp();

      const res = await request(app)
        .patch(`/products/${product._id.toString()}`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ stock: 20 });

      expect(res.status).toBe(200);
      expect(res.body.data.stock).toBe(20);
      expect(res.body.data.name).toBe('Produto Original');
    });

    it('responds 400 for a negative stock, leaving the Product untouched (spec.md AC4)', async () => {
      const { tenant, cookie } = await seedTenantUser(['gestor']);
      const product = await Product.create({ Tenant: tenant._id, name: 'Produto', price: 1000, stock: 5 });
      const app = buildTestApp();

      const res = await request(app)
        .patch(`/products/${product._id.toString()}`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ stock: -1 });

      expect(res.status).toBe(400);
      const persisted = await Product.findById(product._id).lean();
      expect(persisted?.stock).toBe(5);
    });

    it("responds 404 for a non-existent id or one from another tenant's Product (spec.md Error Handling Strategy)", async () => {
      const { cookie } = await seedTenantUser(['gestor']);
      const app = buildTestApp();

      const notFoundRes = await request(app)
        .patch(`/products/${randomId()}`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ stock: 20 });
      expect(notFoundRes.status).toBe(404);

      const owner = await seedTenantUser(['admin']);
      const product = await Product.create({ Tenant: owner.tenant._id, name: 'Produto', price: 1000, stock: 5 });
      const crossTenantRes = await request(app)
        .patch(`/products/${product._id.toString()}`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ stock: 20 });
      expect(crossTenantRes.status).toBe(404);
    });

    it('responds 403 for a caller without canOperate, leaving the Product untouched (spec.md AC5)', async () => {
      const { tenant, cookie } = await seedTenantUser([]);
      const product = await Product.create({ Tenant: tenant._id, name: 'Produto', price: 1000, stock: 5 });
      const app = buildTestApp();

      const res = await request(app)
        .patch(`/products/${product._id.toString()}`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ stock: 20 });

      expect(res.status).toBe(403);
      const persisted = await Product.findById(product._id).lean();
      expect(persisted?.stock).toBe(5);
    });
  });
});
