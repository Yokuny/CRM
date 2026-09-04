import crypto from 'node:crypto';
import type { FieldDef, Role } from '@crm/contracts';
import {
  Customer,
  connect,
  disconnect,
  FieldTemplate,
  FieldTemplateVersion,
  hashToken,
  Process,
  Session,
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
import { createNoopFieldValueStore } from '../providers/fieldValueStore/index.js';
import type { FieldValueStores } from '../services/fieldTemplate.service.js';
import { createFieldTemplateRouter } from './fieldTemplate.router.js';
import { createProcessRouter } from './process.router.js';

const DEVICE = 'test-agent';

// `obs` opcional: template "neutro" usado sempre que o teste não precisa de
// validação estrita de `values` (criação/stage/concorrência).
const OBS_FIELD: FieldDef = { fieldId: 'obs', label: 'Observação', type: 'text', maxLength: 200 };
// `status` obrigatório com opções fechadas: usado nos testes que precisam
// provar rejeição de `values` inválidos (CORE-12/13).
const STATUS_FIELD: FieldDef = {
  fieldId: 'status',
  label: 'Status',
  type: 'status',
  required: true,
  options: [
    { key: 'novo', label: 'Novo', color: '#3B82F6', order: 0 },
    { key: 'ativo', label: 'Ativo', color: '#22C55E', order: 1 },
  ],
};
// AD-023: `stages` é obrigatório em todo template/bump de targetType process.
const PROCESS_STAGES = ['aberto', 'em_andamento', 'concluido'];

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

// Field-template router montado junto (não só process): T19/Done-when exige
// provar a validação contra a templateVersion PRÓPRIA do Process usando o
// endpoint de bump de verdade (feature 2), não um atalho de fixture.
const buildTestApp = () => {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  const { validToken } = createAuthMiddleware(buildAuthDeps());
  const fieldValueStores: FieldValueStores = {
    customer: createNoopFieldValueStore(),
    process: createNoopFieldValueStore(),
  };
  app.use('/field-templates', createFieldTemplateRouter({ validToken, fieldValueStores }));
  app.use('/processes', createProcessRouter({ validToken }));
  app.use(errorHandler);
  return app;
};

// Cada teste recebe seu PRÓPRIO Tenant: mantém a chave tenant+IP do
// processRateLimit (CORE-14) isolada entre os casos deste arquivo — mesmo
// padrão de customer.router.e2e.test.ts.
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

// Segundo usuário no MESMO Tenant — usado no teste de RBAC (CORE-14): gestor
// cria, operador lista, ambos precisam enxergar o MESMO template/Customer.
const addUserToTenant = async (tenant: Awaited<ReturnType<typeof seedTenantUser>>['tenant'], role: Role[]) => {
  seq += 1;
  const user = await User.create({
    name: 'Ciclano de Tal',
    email: `user-${seq}@empresa.com`,
    password: 'hash',
    Tenant: tenant._id,
    role,
  });
  const cookie = await issueSessionCookie(user.id);
  return { user, cookie };
};

const createTemplate = (app: express.Express, cookie: string, body: object) =>
  request(app).post('/field-templates').set('Cookie', cookie).set('User-Agent', DEVICE).send(body);

const bumpTemplate = (app: express.Express, cookie: string, id: string, body: object) =>
  request(app).post(`/field-templates/${id}/versions`).set('Cookie', cookie).set('User-Agent', DEVICE).send(body);

const archiveTemplate = (app: express.Express, cookie: string, id: string) =>
  request(app).post(`/field-templates/${id}/archive`).set('Cookie', cookie).set('User-Agent', DEVICE);

// Cria o template `process` "compra" com os fields/stages dados e devolve seu id.
const setupProcessTemplate = async (
  app: express.Express,
  cookie: string,
  fields: FieldDef[] = [OBS_FIELD],
  stages: string[] = PROCESS_STAGES,
): Promise<string> => {
  const res = await createTemplate(app, cookie, {
    targetType: 'process',
    key: 'compra',
    name: 'Compra',
    fields,
    stages,
  });
  return res.body.data.id as string;
};

// Seed direto no model (@crm/db): Process nunca lê template/templateVersion do
// Customer, então valores opacos bastam aqui — mesmo padrão de
// customer.router.e2e.test.ts (directCustomer).
const seedCustomer = async (tenantId: string, overrides: Partial<Record<string, unknown>> = {}) =>
  Customer.create({
    Tenant: tenantId,
    name: 'Cliente',
    phone: '11900000000',
    template: randomId(),
    templateVersion: 1,
    values: {},
    ...overrides,
  });

const createProcessReq = (app: express.Express, cookie: string, body: object) =>
  request(app).post('/processes').set('Cookie', cookie).set('User-Agent', DEVICE).send(body);

const patchValuesReq = (app: express.Express, cookie: string, id: string, body: object) =>
  request(app).patch(`/processes/${id}/values`).set('Cookie', cookie).set('User-Agent', DEVICE).send(body);

const patchStageReq = (app: express.Express, cookie: string, id: string, body: object) =>
  request(app).patch(`/processes/${id}/stage`).set('Cookie', cookie).set('User-Agent', DEVICE).send(body);

const listProcessesReq = (app: express.Express, cookie: string, customerId: string) =>
  request(app).get('/processes').query({ customerId }).set('Cookie', cookie).set('User-Agent', DEVICE);

describe('process routes', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
    await syncIndexes();
  });

  afterEach(async () => {
    await Promise.all([
      Process.deleteMany({}),
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

  describe('POST /processes', () => {
    it('creates a process (201) with stage = stages[0], persisting the templateVersion snapshot and defaulting empty values (CORE-07)', async () => {
      const { tenant, cookie } = await seedTenantUser(['admin']);
      const app = buildTestApp();
      const templateId = await setupProcessTemplate(app, cookie);
      const customer = await seedCustomer(tenant.id);

      const res = await createProcessReq(app, cookie, { templateKey: 'compra', customerId: customer.id });

      expect(res.status).toBe(201);
      expect(res.body.data.stage).toBe(PROCESS_STAGES[0]);
      // `values` vazio/default (CORE-07) é verificado na resposta da API, o
      // contrato observável pelo cliente — não no documento cru do Mongo:
      // Mongoose (`minimize: true`, default do schema) remove um Mixed
      // totalmente vazio antes de gravar, então `Process.findById().lean()`
      // devolveria `undefined` para `values` mesmo com a criação correta.
      expect(res.body.data.values).toEqual({});
      const created = await Process.findById(res.body.data.id).lean();
      expect(created?.Tenant.toString()).toBe(tenant.id);
      expect(created?.customer.toString()).toBe(customer.id);
      expect(created?.template.toString()).toBe(templateId);
      expect(created?.templateVersion).toBe(1);
      expect(created?.stage).toBe('aberto');
    });

    it('responds 404 and creates nothing for a customerId belonging to another tenant (CORE-10)', async () => {
      const tenantA = await seedTenantUser(['admin']);
      const app = buildTestApp();
      await setupProcessTemplate(app, tenantA.cookie);
      const tenantB = await seedTenantUser(['admin']);
      const foreignCustomer = await seedCustomer(tenantB.tenant.id);

      const res = await createProcessReq(app, tenantA.cookie, {
        templateKey: 'compra',
        customerId: foreignCustomer.id,
      });

      expect(res.status).toBe(404);
      expect(await Process.countDocuments()).toBe(0);
    });

    it('responds 400 and creates nothing when the process template is archived (AD-022 applied to process)', async () => {
      const { tenant, cookie } = await seedTenantUser(['admin']);
      const app = buildTestApp();
      const templateId = await setupProcessTemplate(app, cookie);
      await archiveTemplate(app, cookie, templateId);
      const customer = await seedCustomer(tenant.id);

      const res = await createProcessReq(app, cookie, { templateKey: 'compra', customerId: customer.id });

      expect(res.status).toBe(400);
      expect(await Process.countDocuments()).toBe(0);
    });

    it('responds 400 and creates nothing when values are invalid against the current process template (CORE-12/13)', async () => {
      const { tenant, cookie } = await seedTenantUser(['admin']);
      const app = buildTestApp();
      await setupProcessTemplate(app, cookie, [STATUS_FIELD]);
      const customer = await seedCustomer(tenant.id);

      const res = await createProcessReq(app, cookie, {
        templateKey: 'compra',
        customerId: customer.id,
        values: { status: 'inexistente' },
      });

      expect(res.status).toBe(400);
      expect(await Process.countDocuments()).toBe(0);
    });

    it('rejects a body carrying a forged Tenant/tenantId/orgId key (schema is strict, CORE-06)', async () => {
      const { tenant, cookie } = await seedTenantUser(['admin']);
      const app = buildTestApp();
      await setupProcessTemplate(app, cookie);
      const customer = await seedCustomer(tenant.id);

      const res = await createProcessReq(app, cookie, {
        templateKey: 'compra',
        customerId: customer.id,
        tenantId: '65b0f3e2a1c4d5e6f7081920',
      });

      expect(res.status).toBe(400);
      expect(await Process.countDocuments()).toBe(0);
    });

    it('allows gestor to create and operador to list processes, with no isAdmin gate (CORE-14)', async () => {
      const admin = await seedTenantUser(['admin']);
      const app = buildTestApp();
      await setupProcessTemplate(app, admin.cookie);
      const customer = await seedCustomer(admin.tenant.id);
      const gestor = await addUserToTenant(admin.tenant, ['gestor']);
      const operador = await addUserToTenant(admin.tenant, ['operador']);

      const created = await createProcessReq(app, gestor.cookie, { templateKey: 'compra', customerId: customer.id });
      expect(created.status).toBe(201);

      const listed = await listProcessesReq(app, operador.cookie, customer.id);
      expect(listed.status).toBe(200);
      expect(listed.body.data.items).toHaveLength(1);
    });

    it('responds 429 once process mutations exceed the rate limit window (CORE-14)', async () => {
      const { tenant, cookie } = await seedTenantUser(['admin']);
      const app = buildTestApp();
      await setupProcessTemplate(app, cookie);
      const customer = await seedCustomer(tenant.id);
      const body = { templateKey: 'compra', customerId: customer.id };

      let last: { status: number } | undefined;
      for (let i = 0; i < 6; i++) {
        last = await createProcessReq(app, cookie, body);
      }

      expect(last?.status).toBe(429);
    });
  });

  describe('PATCH /processes/:id/values', () => {
    it('persists a valid values update (CORE-08 happy path)', async () => {
      const { tenant, cookie } = await seedTenantUser(['admin']);
      const app = buildTestApp();
      await setupProcessTemplate(app, cookie, [STATUS_FIELD]);
      const customer = await seedCustomer(tenant.id);
      const created = await createProcessReq(app, cookie, {
        templateKey: 'compra',
        customerId: customer.id,
        values: { status: 'novo' },
      });

      const res = await patchValuesReq(app, cookie, created.body.data.id, { values: { status: 'ativo' } });

      expect(res.status).toBe(200);
      const updated = await Process.findById(created.body.data.id).lean();
      expect(updated?.values).toEqual({ status: 'ativo' });
    });

    it('responds 400 and leaves values unchanged when the update is invalid against the templateVersion (CORE-08/12/13)', async () => {
      const { tenant, cookie } = await seedTenantUser(['admin']);
      const app = buildTestApp();
      await setupProcessTemplate(app, cookie, [STATUS_FIELD]);
      const customer = await seedCustomer(tenant.id);
      const created = await createProcessReq(app, cookie, {
        templateKey: 'compra',
        customerId: customer.id,
        values: { status: 'novo' },
      });

      const res = await patchValuesReq(app, cookie, created.body.data.id, { values: { status: 'inexistente' } });

      expect(res.status).toBe(400);
      const unchanged = await Process.findById(created.body.data.id).lean();
      expect(unchanged?.values).toEqual({ status: 'novo' });
    });

    // CORE-08: prova o requisito central — um Process aberto na versão 1 do
    // template continua sendo validado contra a versão 1 mesmo depois do
    // template avançar para a versão 2 (bump tornou `obs` obrigatório). Um
    // Process novo, criado DEPOIS do bump, é validado contra a versão 2 (e
    // rejeitado com o mesmo payload) — o par de asserções mostra que a
    // implementação realmente diferencia as duas versões, não que "tudo passa".
    it("validates PATCH .../values against the Process's OWN templateVersion, not the template's current one, after a later bump (CORE-08)", async () => {
      const { tenant, cookie } = await seedTenantUser(['admin']);
      const app = buildTestApp();
      const templateId = await setupProcessTemplate(app, cookie, [OBS_FIELD]);
      const customer = await seedCustomer(tenant.id);

      const originalProcess = await createProcessReq(app, cookie, { templateKey: 'compra', customerId: customer.id });
      expect(originalProcess.status).toBe(201);
      const original = await Process.findById(originalProcess.body.data.id).lean();
      expect(original?.templateVersion).toBe(1);

      const bump = await bumpTemplate(app, cookie, templateId, {
        expectedVersion: 1,
        fields: [{ ...OBS_FIELD, required: true }],
        stages: PROCESS_STAGES,
      });
      expect(bump.status).toBe(200);
      expect(bump.body.data.currentVersion).toBe(2);

      // Processo antigo (snapshot v1, `obs` opcional): `values: {}` continua válido.
      const updateOld = await patchValuesReq(app, cookie, originalProcess.body.data.id, { values: {} });
      expect(updateOld.status).toBe(200);

      // Processo novo, criado DEPOIS do bump (resolve a v2, `obs` obrigatório):
      // o MESMO payload `values: {}` agora é inválido — prova que v1 e v2 são
      // tratadas de forma diferente, não que a validação sempre passa.
      const newProcess = await createProcessReq(app, cookie, { templateKey: 'compra', customerId: customer.id });
      expect(newProcess.status).toBe(400);
    });
  });

  describe('PATCH /processes/:id/stage', () => {
    it('moves through a valid sequence of stages (CORE-09/17 happy path)', async () => {
      const { tenant, cookie } = await seedTenantUser(['admin']);
      const app = buildTestApp();
      await setupProcessTemplate(app, cookie);
      const customer = await seedCustomer(tenant.id);
      const created = await createProcessReq(app, cookie, { templateKey: 'compra', customerId: customer.id });
      const id = created.body.data.id as string;

      const first = await patchStageReq(app, cookie, id, { stage: 'em_andamento' });
      expect(first.status).toBe(200);
      expect((await Process.findById(id).lean())?.stage).toBe('em_andamento');

      const second = await patchStageReq(app, cookie, id, { stage: 'concluido' });
      expect(second.status).toBe(200);
      expect((await Process.findById(id).lean())?.stage).toBe('concluido');
    });

    it('responds 400 and leaves stage unchanged for a value outside the templateVersion stages (CORE-09/17 negative)', async () => {
      const { tenant, cookie } = await seedTenantUser(['admin']);
      const app = buildTestApp();
      await setupProcessTemplate(app, cookie);
      const customer = await seedCustomer(tenant.id);
      const created = await createProcessReq(app, cookie, { templateKey: 'compra', customerId: customer.id });
      const id = created.body.data.id as string;

      const res = await patchStageReq(app, cookie, id, { stage: 'inexistente' });

      expect(res.status).toBe(400);
      expect((await Process.findById(id).lean())?.stage).toBe('aberto');
    });

    it('resolves two concurrent stage-move requests to one consistent final state, never a torn document (CORE-15)', async () => {
      const { tenant, cookie } = await seedTenantUser(['admin']);
      const app = buildTestApp();
      await setupProcessTemplate(app, cookie);
      const customer = await seedCustomer(tenant.id);
      const created = await createProcessReq(app, cookie, { templateKey: 'compra', customerId: customer.id });
      const id = created.body.data.id as string;

      const [resA, resB] = await Promise.all([
        patchStageReq(app, cookie, id, { stage: 'em_andamento' }),
        patchStageReq(app, cookie, id, { stage: 'concluido' }),
      ]);

      expect(resA.status).toBe(200);
      expect(resB.status).toBe(200);
      const final = await Process.findById(id).lean();
      expect(['em_andamento', 'concluido']).toContain(final?.stage);
    });
  });

  describe('GET /processes', () => {
    it("returns only the target customer's processes, filtered by customerId (P2/CORE-11)", async () => {
      const { tenant, cookie } = await seedTenantUser(['admin']);
      const app = buildTestApp();
      await setupProcessTemplate(app, cookie);
      const customerA = await seedCustomer(tenant.id, { name: 'Cliente A' });
      const customerB = await seedCustomer(tenant.id, { name: 'Cliente B' });
      await createProcessReq(app, cookie, { templateKey: 'compra', customerId: customerA.id });
      await createProcessReq(app, cookie, { templateKey: 'compra', customerId: customerA.id });
      await createProcessReq(app, cookie, { templateKey: 'compra', customerId: customerB.id });

      const res = await listProcessesReq(app, cookie, customerA.id);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(2);
      for (const item of res.body.data.items as Array<{ customer: string }>) {
        expect(item.customer).toBe(customerA.id);
      }
    });

    it('returns an empty list, not an error, for a customer with no processes yet (spec Edge Case)', async () => {
      const { tenant, cookie } = await seedTenantUser(['admin']);
      const app = buildTestApp();
      const customer = await seedCustomer(tenant.id);

      const res = await listProcessesReq(app, cookie, customer.id);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([]);
    });
  });

  describe('observability (CORE-16)', () => {
    it('records dbReqResTime for every process repository operation exercised by a full flow', async () => {
      const { tenant, cookie } = await seedTenantUser(['admin']);
      const app = buildTestApp();
      await setupProcessTemplate(app, cookie);
      const customer = await seedCustomer(tenant.id);

      const created = await createProcessReq(app, cookie, { templateKey: 'compra', customerId: customer.id });
      await patchValuesReq(app, cookie, created.body.data.id, { values: {} });
      await patchStageReq(app, cookie, created.body.data.id, { stage: 'em_andamento' });
      await listProcessesReq(app, cookie, customer.id);

      const metric = await dbReqResTime.get();
      const recordedOperations = new Set(metric.values.map((value) => value.labels.operation));

      for (const operation of [
        'process.createProcess',
        'process.findById',
        'process.updateValues',
        'process.updateStage',
        'process.findByCustomer',
      ]) {
        expect(recordedOperations, `esperava "${operation}" instrumentado`).toContain(operation);
      }
    });
  });
});
