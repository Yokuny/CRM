import crypto from 'node:crypto';
import type { Role } from '@crm/contracts';
import { connect, disconnect, hashToken, Order, Product, Session, syncIndexes, Tenant, User } from '@crm/db';
import cookieParser from 'cookie-parser';
import express from 'express';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../config/env.config.js';
import type { AuthDeps } from '../middlewares/authentication.middleware.js';
import { createAuthMiddleware } from '../middlewares/authentication.middleware.js';
import { errorHandler } from '../middlewares/errorHandler.middleware.js';
import { createOrderRouter } from './order.router.js';

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
  app.use('/orders', createOrderRouter({ validToken }));
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

const seedOrder = async (tenantId: string, overrides: Partial<Record<string, unknown>> = {}) =>
  Order.create({
    Tenant: tenantId,
    conversation: randomId(),
    customer: randomId(),
    items: [{ product: randomId(), name: 'Produto', unitPrice: 1000, quantity: 1 }],
    totalPrice: 1000,
    idempotencyKey: randomId(),
    ...overrides,
  });

describe('order routes', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
    await syncIndexes();
  });

  afterEach(async () => {
    await Promise.all([
      Order.deleteMany({}),
      Product.deleteMany({}),
      Session.deleteMany({}),
      User.deleteMany({}),
      Tenant.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await disconnect();
  });

  describe('GET /orders (spec.md P1 "Aprovar/rejeitar pedido"/AC1)', () => {
    it('responds 200 with a paginated list defaulting to status pending_approval, scoped to the session Tenant', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      await seedOrder(tenant._id.toString(), { status: 'pending_approval' });
      await seedOrder(tenant._id.toString(), { status: 'confirmed' });
      const other = await seedTenantUser(['admin']);
      await seedOrder(other.tenant._id.toString(), { status: 'pending_approval' });
      const app = buildTestApp();

      const res = await request(app).get('/orders').set('Cookie', cookie).set('User-Agent', DEVICE);

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.items[0].status).toBe('pending_approval');
    });

    it('responds 403 for a caller without canOperate, without returning any order data', async () => {
      const { tenant, cookie } = await seedTenantUser([]);
      await seedOrder(tenant._id.toString());
      const app = buildTestApp();

      const res = await request(app).get('/orders').set('Cookie', cookie).set('User-Agent', DEVICE);

      expect(res.status).toBe(403);
      expect(res.body.data).toBeUndefined();
    });
  });

  describe('POST /orders/:id/approve (spec.md AC4/AC5)', () => {
    it('confirms the Order and reserves stock when customerConfirmed is already true and stock suffices', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const product = await Product.create({ Tenant: tenant._id, name: 'Produto', price: 1000, stock: 5 });
      const order = await seedOrder(tenant._id.toString(), {
        customerConfirmed: true,
        items: [{ product: product._id, name: 'Produto', unitPrice: 1000, quantity: 2 }],
      });
      const app = buildTestApp();

      const res = await request(app)
        .post(`/orders/${order._id.toString()}/approve`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('confirmed');
      const persistedProduct = await Product.findById(product._id).lean();
      expect(persistedProduct?.stock).toBe(3);
    });

    it('responds 200 with the Order still pending_approval and confirmFailureReason set when stock reservation fails (spec.md AC5, design.md Tech Decisions: never an HTTP error)', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const product = await Product.create({ Tenant: tenant._id, name: 'Produto', price: 1000, stock: 0 });
      const order = await seedOrder(tenant._id.toString(), {
        customerConfirmed: true,
        items: [{ product: product._id, name: 'Produto', unitPrice: 1000, quantity: 1 }],
      });
      const app = buildTestApp();

      const res = await request(app)
        .post(`/orders/${order._id.toString()}/approve`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('pending_approval');
      expect(res.body.data.confirmFailureReason).toEqual(expect.any(String));
      const persistedProduct = await Product.findById(product._id).lean();
      expect(persistedProduct?.stock).toBe(0);
    });

    it('responds 409 when approving an already-terminal Order (spec.md AC7)', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const order = await seedOrder(tenant._id.toString(), { status: 'confirmed' });
      const app = buildTestApp();

      const res = await request(app)
        .post(`/orders/${order._id.toString()}/approve`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(409);
    });

    it('responds 404 for a non-existent id or one from another tenant (spec.md Edge Cases)', async () => {
      const { cookie } = await seedTenantUser(['operador']);
      const app = buildTestApp();

      const notFoundRes = await request(app)
        .post(`/orders/${randomId()}/approve`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);
      expect(notFoundRes.status).toBe(404);

      const owner = await seedTenantUser(['admin']);
      const order = await seedOrder(owner.tenant._id.toString());
      const crossTenantRes = await request(app)
        .post(`/orders/${order._id.toString()}/approve`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);
      expect(crossTenantRes.status).toBe(404);
    });

    it('responds 403 for a caller without canOperate, leaving the Order untouched (spec.md Assumptions: any operator, but never no-role)', async () => {
      const { tenant, cookie } = await seedTenantUser([]);
      const order = await seedOrder(tenant._id.toString());
      const app = buildTestApp();

      const res = await request(app)
        .post(`/orders/${order._id.toString()}/approve`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(403);
      const persisted = await Order.findById(order._id).lean();
      expect(persisted?.status).toBe('pending_approval');
    });
  });

  describe('POST /orders/:id/reject (spec.md AC6)', () => {
    it('marks the Order rejected with the given reason, without touching stock', async () => {
      const { tenant, cookie } = await seedTenantUser(['gestor']);
      const product = await Product.create({ Tenant: tenant._id, name: 'Produto', price: 1000, stock: 5 });
      const order = await seedOrder(tenant._id.toString(), {
        items: [{ product: product._id, name: 'Produto', unitPrice: 1000, quantity: 2 }],
      });
      const app = buildTestApp();

      const res = await request(app)
        .post(`/orders/${order._id.toString()}/reject`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ reason: 'Fora de estoque' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('rejected');
      expect(res.body.data.rejectionReason).toBe('Fora de estoque');
      const persistedProduct = await Product.findById(product._id).lean();
      expect(persistedProduct?.stock).toBe(5);
    });

    it('responds 409 when rejecting an already-terminal Order, without changing it (spec.md AC7)', async () => {
      const { tenant, cookie } = await seedTenantUser(['gestor']);
      const order = await seedOrder(tenant._id.toString(), { status: 'rejected', rejectionReason: 'original' });
      const app = buildTestApp();

      const res = await request(app)
        .post(`/orders/${order._id.toString()}/reject`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ reason: 'nova tentativa' });

      expect(res.status).toBe(409);
      const persisted = await Order.findById(order._id).lean();
      expect(persisted?.rejectionReason).toBe('original');
    });

    it('responds 403 for a caller without canOperate, leaving the Order untouched', async () => {
      const { tenant, cookie } = await seedTenantUser([]);
      const order = await seedOrder(tenant._id.toString());
      const app = buildTestApp();

      const res = await request(app)
        .post(`/orders/${order._id.toString()}/reject`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({});

      expect(res.status).toBe(403);
      const persisted = await Order.findById(order._id).lean();
      expect(persisted?.status).toBe('pending_approval');
    });
  });
});
