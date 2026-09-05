import crypto from 'node:crypto';
import type { Role } from '@crm/contracts';
import {
  archiveFieldTemplate,
  Customer,
  connect,
  disconnect,
  FieldTemplate,
  FieldTemplateVersion,
  hashToken,
  Session,
  seedDefaultCustomerTemplate,
  syncIndexes,
  Tenant,
  User,
} from '@crm/db';
import cookieParser from 'cookie-parser';
import express from 'express';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../config/env.config.js';
import { dbReqResTime } from '../metrics/db.metric.js';
import type { AuthDeps } from '../middlewares/authentication.middleware.js';
import { createAuthMiddleware } from '../middlewares/authentication.middleware.js';
import { errorHandler } from '../middlewares/errorHandler.middleware.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../services/customer.service.js';
import { createCustomerRouter } from './customer.router.js';

const DEVICE = 'test-agent';

// Sem `mongoose` aqui (AD-010/boundary estrutural: só packages/db importa
// mongoose) — mesmo padrão de customer.fieldValueStore.int.test.ts (T10/T11).
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
  app.use('/customers', createCustomerRouter({ validToken }));
  app.use(errorHandler);
  return app;
};

// Cada teste recebe seu PRÓPRIO Tenant: mantém a chave tenant+IP do
// customerRateLimit (CORE-14) isolada entre os casos deste arquivo — mesmo
// padrão de fieldTemplate.router.e2e.test.ts.
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

const createCustomerReq = (app: express.Express, cookie: string, body: object) =>
  request(app).post('/customers').set('Cookie', cookie).set('User-Agent', DEVICE).send(body);

const listCustomersReq = (app: express.Express, cookie: string, query: Record<string, string | number>) =>
  request(app).get('/customers').query(query).set('Cookie', cookie).set('User-Agent', DEVICE);

const getCustomerReq = (app: express.Express, cookie: string, id: string) =>
  request(app).get(`/customers/${id}`).set('Cookie', cookie).set('User-Agent', DEVICE);

// Seed direto no model (@crm/db) — usado pelos testes de LISTAGEM, que não
// precisam passar pela validação do field-engine (só a criação via serviço
// consulta o template corrente). `template`/`templateVersion` são apontadores
// opacos aqui: nada na listagem os desreferencia.
const directCustomer = (Tenant: string, overrides: Partial<Record<string, unknown>> = {}) => ({
  Tenant,
  name: 'Cliente',
  phone: '11900000000',
  template: randomId(),
  templateVersion: 1,
  values: {},
  ...overrides,
});

describe('customer routes', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
    await syncIndexes();
  });

  afterEach(async () => {
    await Promise.all([
      Customer.deleteMany({}),
      FieldTemplateVersion.deleteMany({}),
      FieldTemplate.deleteMany({}),
      Session.deleteMany({}),
      User.deleteMany({}),
      Tenant.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await disconnect();
  });

  describe('POST /customers', () => {
    it('creates a customer (201), persisting the session Tenant and the resolved template/templateVersion snapshot (CORE-01)', async () => {
      const { tenant, cookie } = await seedTenantUser(['admin']);
      await seedDefaultCustomerTemplate(tenant.id);
      const app = buildTestApp();

      const res = await createCustomerReq(app, cookie, {
        name: 'Maria Silva',
        phone: '11912345678',
        document: '12345678900',
        values: { status: 'novo' },
      });

      expect(res.status).toBe(201);
      const created = await Customer.findById(res.body.data.id).lean();
      expect(created?.Tenant.toString()).toBe(tenant.id);
      expect(created?.name).toBe('Maria Silva');
      expect(created?.phone).toBe('11912345678');
      expect(created?.document).toBe('12345678900');
      expect(created?.values).toEqual({ status: 'novo' });
      expect(created?.templateVersion).toBe(1);
    });

    it('responds 400 and creates nothing when values are invalid against the current customer template (CORE-02/CORE-13)', async () => {
      const { tenant, cookie } = await seedTenantUser(['admin']);
      await seedDefaultCustomerTemplate(tenant.id);
      const app = buildTestApp();

      const res = await createCustomerReq(app, cookie, {
        name: 'Maria Silva',
        phone: '11912345678',
        values: { status: 'nao_existe' },
      });

      expect(res.status).toBe(400);
      expect(await Customer.countDocuments()).toBe(0);
    });

    it('responds 400 and creates nothing when the customer template is archived (AD-022 closure)', async () => {
      const { tenant, cookie } = await seedTenantUser(['admin']);
      await seedDefaultCustomerTemplate(tenant.id);
      const template = await FieldTemplate.findOne({
        Tenant: tenant._id,
        targetType: 'customer',
        key: 'default',
      }).lean();
      await archiveFieldTemplate(template?._id.toString() as string);
      const app = buildTestApp();

      const res = await createCustomerReq(app, cookie, {
        name: 'Maria Silva',
        phone: '11912345678',
        values: { status: 'novo' },
      });

      expect(res.status).toBe(400);
      expect(await Customer.countDocuments()).toBe(0);
    });

    it('allows gestor to create and operador to list customers, with no isAdmin gate (CORE-14)', async () => {
      const gestor = await seedTenantUser(['gestor']);
      await seedDefaultCustomerTemplate(gestor.tenant.id);
      const operador = await seedTenantUser(['operador']);
      const app = buildTestApp();

      const created = await createCustomerReq(app, gestor.cookie, {
        name: 'Cliente',
        phone: '11988887777',
        values: { status: 'novo' },
      });
      const listed = await listCustomersReq(app, operador.cookie, {});

      expect(created.status).toBe(201);
      expect(listed.status).toBe(200);
    });

    it('rejects a body carrying a forged Tenant/tenantId/orgId key (schema is strict, CORE-06)', async () => {
      const { cookie } = await seedTenantUser(['admin']);
      const app = buildTestApp();

      const res = await createCustomerReq(app, cookie, {
        name: 'Maria',
        phone: '11999999999',
        values: { status: 'novo' },
        tenantId: '65b0f3e2a1c4d5e6f7081920',
      });

      expect(res.status).toBe(400);
      expect(await Customer.countDocuments()).toBe(0);
    });

    it('normalizes phone and document formatting before persisting (spec Edge Cases)', async () => {
      const { tenant, cookie } = await seedTenantUser(['admin']);
      await seedDefaultCustomerTemplate(tenant.id);
      const app = buildTestApp();

      const res = await createCustomerReq(app, cookie, {
        name: 'Maria Silva',
        phone: '(11) 91234-5678',
        document: '123.456.789-00',
        values: { status: 'novo' },
      });

      expect(res.status).toBe(201);
      const created = await Customer.findById(res.body.data.id).lean();
      expect(created?.phone).toBe('11912345678');
      expect(created?.document).toBe('12345678900');
    });

    it('responds 429 once customer mutations exceed the rate limit window (CORE-14)', async () => {
      const { tenant, cookie } = await seedTenantUser(['admin']);
      await seedDefaultCustomerTemplate(tenant.id);
      const app = buildTestApp();
      const body = { name: 'Maria', phone: '11999999999', values: { status: 'novo' } };

      let last: { status: number } | undefined;
      for (let i = 0; i < 6; i++) {
        last = await createCustomerReq(app, cookie, body);
      }

      expect(last?.status).toBe(429);
    });
  });

  describe('GET /customers', () => {
    it('matches customers by name or phone via the q search parameter (CORE-03)', async () => {
      const { tenant, cookie } = await seedTenantUser(['admin']);
      await Customer.create(directCustomer(tenant._id.toString(), { name: 'Maria Silva', phone: '11911111111' }));
      await Customer.create(directCustomer(tenant._id.toString(), { name: 'Ana Maria', phone: '11922222222' }));
      await Customer.create(directCustomer(tenant._id.toString(), { name: 'João Souza', phone: '11933333333' }));
      const app = buildTestApp();

      const byName = await listCustomersReq(app, cookie, { q: 'Maria' });
      expect(byName.status).toBe(200);
      expect(byName.body.data.total).toBe(2);
      expect(byName.body.data.items.map((c: { name: string }) => c.name).sort()).toEqual(['Ana Maria', 'Maria Silva']);

      const byPhone = await listCustomersReq(app, cookie, { q: '933333333' });
      expect(byPhone.body.data.items).toHaveLength(1);
      expect(byPhone.body.data.items[0].name).toBe('João Souza');
    });

    it('orders by name ascending when requested, and by createdAt descending by default (CORE-03)', async () => {
      const { tenant, cookie } = await seedTenantUser(['admin']);
      // createdAt explícito (não sequencial no tempo real): sem isso, duas
      // criações no mesmo milissegundo empatam e o desempate do Mongo deixa a
      // ordem indeterminada — precisamos de timestamps garantidamente
      // distintos para provar a ordenação DESC de verdade.
      await Customer.create(
        directCustomer(tenant._id.toString(), { name: 'Carlos', createdAt: new Date('2024-01-01T00:00:00.000Z') }),
      );
      await Customer.create(
        directCustomer(tenant._id.toString(), { name: 'Ana', createdAt: new Date('2024-01-02T00:00:00.000Z') }),
      );
      await Customer.create(
        directCustomer(tenant._id.toString(), { name: 'Bruno', createdAt: new Date('2024-01-03T00:00:00.000Z') }),
      );
      const app = buildTestApp();

      const byName = await listCustomersReq(app, cookie, { sort: 'name', order: 'asc' });
      expect(byName.body.data.items.map((c: { name: string }) => c.name)).toEqual(['Ana', 'Bruno', 'Carlos']);

      const byDefault = await listCustomersReq(app, cookie, {});
      expect(byDefault.body.data.items.map((c: { name: string }) => c.name)).toEqual(['Bruno', 'Ana', 'Carlos']);
    });

    it('clamps page/limit to the configured bounds, never returning the full collection unpaginated (CORE-12/spec Edge Cases)', async () => {
      const { tenant, cookie } = await seedTenantUser(['admin']);
      const docs = Array.from({ length: MAX_PAGE_SIZE + 1 }, (_, i) =>
        directCustomer(tenant._id.toString(), { name: `Cliente ${i}` }),
      );
      await Customer.insertMany(docs);
      const app = buildTestApp();

      const defaultPage = await listCustomersReq(app, cookie, {});
      expect(defaultPage.body.data.items).toHaveLength(DEFAULT_PAGE_SIZE);
      expect(defaultPage.body.data.total).toBe(MAX_PAGE_SIZE + 1);

      const hugeLimit = await listCustomersReq(app, cookie, { limit: 999999 });
      expect(hugeLimit.body.data.items).toHaveLength(MAX_PAGE_SIZE);

      const negativePage = await listCustomersReq(app, cookie, { page: -5 });
      expect(negativePage.body.data.items.map((c: { id: string }) => c.id)).toEqual(
        defaultPage.body.data.items.map((c: { id: string }) => c.id),
      );
    });

    it('returns an empty list, not an error, when status filters to zero matches (CORE-04/spec Edge Case)', async () => {
      const { tenant, cookie } = await seedTenantUser(['admin']);
      await Customer.create(directCustomer(tenant._id.toString(), { values: { status: 'novo' } }));
      const app = buildTestApp();

      const res = await listCustomersReq(app, cookie, { status: 'nao_existe' });

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ items: [], total: 0 });
    });

    it('filters the listing by status, matching exactly the values expected for a kanban column (CORE-04)', async () => {
      const { tenant, cookie } = await seedTenantUser(['admin']);
      await Customer.create(directCustomer(tenant._id.toString(), { name: 'Novo A', values: { status: 'novo' } }));
      await Customer.create(directCustomer(tenant._id.toString(), { name: 'Novo B', values: { status: 'novo' } }));
      await Customer.create(directCustomer(tenant._id.toString(), { name: 'Ativo A', values: { status: 'ativo' } }));
      const app = buildTestApp();

      const res = await listCustomersReq(app, cookie, { status: 'novo' });

      expect(res.body.data.total).toBe(2);
      expect(res.body.data.items.map((c: { name: string }) => c.name).sort()).toEqual(['Novo A', 'Novo B']);
    });

    it("never returns another tenant's customers through the listing, even with the same name (CORE-05)", async () => {
      const tenantA = await seedTenantUser(['admin']);
      const tenantB = await seedTenantUser(['admin']);
      await Customer.create(directCustomer(tenantA.tenant._id.toString(), { name: 'Cliente Espelhado' }));
      await Customer.create(directCustomer(tenantB.tenant._id.toString(), { name: 'Cliente Espelhado' }));
      const app = buildTestApp();

      const res = await listCustomersReq(app, tenantA.cookie, {});

      expect(await Customer.countDocuments({})).toBe(2);
      expect(res.body.data.total).toBe(1);
      const customerA = await Customer.findOne({ Tenant: tenantA.tenant._id }).lean();
      expect(res.body.data.items[0].id).toBe(customerA?._id.toString());
    });
  });

  describe('GET /customers/:id', () => {
    it('returns 200 with the full CustomerRecord for an existing id in the caller own tenant (WEB-05)', async () => {
      const { tenant, cookie } = await seedTenantUser(['admin']);
      await seedDefaultCustomerTemplate(tenant.id);
      const app = buildTestApp();
      const created = await createCustomerReq(app, cookie, {
        name: 'Maria Silva',
        phone: '11912345678',
        document: '12345678900',
        values: { status: 'novo' },
      });

      const res = await getCustomerReq(app, cookie, created.body.data.id);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        id: created.body.data.id,
        name: 'Maria Silva',
        phone: '11912345678',
        document: '12345678900',
        template: created.body.data.template,
        templateVersion: 1,
        values: { status: 'novo' },
        createdAt: created.body.data.createdAt,
        updatedAt: created.body.data.updatedAt,
      });
    });

    it('responds 404 with "Customer não encontrado" for an id that does not exist (WEB-05 AC2)', async () => {
      const { cookie } = await seedTenantUser(['admin']);
      const app = buildTestApp();

      const res = await getCustomerReq(app, cookie, randomId());

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ success: false, message: 'Customer não encontrado' });
    });

    it("responds 404 for another tenant's id, never leaking its data (AD-010, WEB-05 AC2)", async () => {
      const tenantA = await seedTenantUser(['admin']);
      await seedDefaultCustomerTemplate(tenantA.tenant.id);
      const tenantB = await seedTenantUser(['admin']);
      const app = buildTestApp();
      const created = await createCustomerReq(app, tenantA.cookie, {
        name: 'Cliente A',
        phone: '11955555555',
        values: { status: 'novo' },
      });

      const res = await getCustomerReq(app, tenantB.cookie, created.body.data.id);

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ success: false, message: 'Customer não encontrado' });
    });
  });

  describe('observability (CORE-16)', () => {
    it('records dbReqResTime for every customer repository operation exercised by a full flow', async () => {
      const { tenant, cookie } = await seedTenantUser(['admin']);
      await seedDefaultCustomerTemplate(tenant.id);
      const app = buildTestApp();

      await createCustomerReq(app, cookie, { name: 'Maria', phone: '11999999999', values: { status: 'novo' } });
      await listCustomersReq(app, cookie, {});

      const metric = await dbReqResTime.get();
      const recordedOperations = new Set(metric.values.map((value) => value.labels.operation));

      for (const operation of ['customer.createCustomer', 'customer.listCustomers']) {
        expect(recordedOperations, `esperava "${operation}" instrumentado`).toContain(operation);
      }
    });
  });
});
