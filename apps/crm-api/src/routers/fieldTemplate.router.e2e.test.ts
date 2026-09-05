import crypto from 'node:crypto';
import type { FieldDef, MigrationPlan, Role } from '@crm/contracts';
import {
  connect,
  disconnect,
  FieldTemplate,
  FieldTemplateVersion,
  hashToken,
  Session,
  syncIndexes,
  Tenant,
  User,
} from '@crm/db';
import { hydrate } from '@crm/field-engine';
import cookieParser from 'cookie-parser';
import express from 'express';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { env } from '../config/env.config.js';
import { dbReqResTime } from '../metrics/db.metric.js';
import type { AuthDeps } from '../middlewares/authentication.middleware.js';
import { createAuthMiddleware } from '../middlewares/authentication.middleware.js';
import { errorHandler } from '../middlewares/errorHandler.middleware.js';
import type { FieldValueStore } from '../providers/fieldValueStore/index.js';
import type { FieldValueStores } from '../services/fieldTemplate.service.js';
import { createFieldTemplateRouter } from './fieldTemplate.router.js';

const DEVICE = 'test-agent';

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
const OBS_FIELD: FieldDef = { fieldId: 'obs', label: 'Observação', type: 'text', maxLength: 200 };
// AD-023: `stages` é obrigatório para todo template/bump de targetType
// process — reusado em todo fixture deste arquivo que cria/avança um.
const PROCESS_STAGES = ['aberto', 'em_andamento', 'concluido'];

// ---------------------------------------------------------------------------
// Fake em memória do FieldValueStore (AD-021): guarda os "registros" numa cópia
// local e só a promove no fim, então a atomicidade é trivial — é o que permite
// provar o rollback de FLD-12 sem transação nativa do Mongo. `failOnMigrate` é
// o hook de fault injection: falha DEPOIS de montar a cópia e ANTES de trocar.
// ---------------------------------------------------------------------------
type FakeRecord = { id: string; templateVersion: number };

type FakeFieldValueStore = FieldValueStore & {
  calls: Array<{
    tenantId: string;
    templateId: string;
    fromVersion: number;
    toVersion: number;
    migration: MigrationPlan;
  }>;
  records: FakeRecord[];
  failOnMigrate: boolean;
};

const createFakeFieldValueStore = (records: FakeRecord[] = []): FakeFieldValueStore => {
  const store: FakeFieldValueStore = {
    calls: [],
    records,
    failOnMigrate: false,
    countByTemplateVersion: async (_tenantId, _templateId, version) =>
      store.records.filter((record) => record.templateVersion === version).length,
    migrateValues: async (tenantId, templateId, fromVersion, toVersion, migration) => {
      store.calls.push({ tenantId, templateId, fromVersion, toVersion, migration });
      const next = store.records.map((record) =>
        record.templateVersion === fromVersion ? { ...record, templateVersion: toVersion } : record,
      );
      if (store.failOnMigrate) throw new Error('falha injetada no meio da migração');
      store.records = next;
      return { migrated: next.filter((record) => record.templateVersion === toVersion).length };
    },
  };
  return store;
};

const buildStores = (store: FieldValueStore): FieldValueStores => ({ customer: store, process: store });

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

const buildTestApp = (stores: FieldValueStores) => {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  const { validToken } = createAuthMiddleware(buildAuthDeps());
  app.use('/field-templates', createFieldTemplateRouter({ validToken, fieldValueStores: stores }));
  app.use(errorHandler);
  return app;
};

// Cada teste recebe seu PRÓPRIO Tenant: é o que mantém a chave tenant+IP do
// fieldTemplateRateLimit (FLD-16) isolada entre os casos deste arquivo.
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

// Segundo usuário no MESMO Tenant de um `seedTenantUser` anterior — é o que
// prova RBAC de verdade (FLD-07) em rotas por :id: sem isso, um usuário de
// OUTRO tenant já recebe 404 do escopo de Tenant (findTemplateById) antes de
// qualquer decisão de `isAdmin`, e o 403 do teste não provaria RBAC nenhum.
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

const getCurrent = (app: express.Express, cookie: string, targetType: string, key: string) =>
  request(app)
    .get('/field-templates/current')
    .query({ targetType, key })
    .set('Cookie', cookie)
    .set('User-Agent', DEVICE);

const listTemplates = (app: express.Express, cookie: string, targetType: string) =>
  request(app)
    .get('/field-templates')
    .query({ targetType })
    .set('Cookie', cookie)
    .set('User-Agent', DEVICE);

describe('field-template routes', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
    await syncIndexes();
  });

  afterEach(async () => {
    await Promise.all([
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

  describe('POST /field-templates', () => {
    it('creates the template at currentVersion 1 with an immutable version snapshot (FLD-04/AC1)', async () => {
      const { tenant, cookie } = await seedTenantUser(['admin']);
      const app = buildTestApp(buildStores(createFakeFieldValueStore()));

      const res = await createTemplate(app, cookie, {
        targetType: 'process',
        key: 'compra',
        name: 'Compra',
        fields: [STATUS_FIELD],
        stages: PROCESS_STAGES,
      });

      expect(res.status).toBe(201);
      expect(res.body.data.currentVersion).toBe(1);

      const template = await FieldTemplate.findById(res.body.data.id).lean();
      expect(template?.Tenant.toString()).toBe(tenant.id);
      expect(template?.targetType).toBe('process');
      expect(template?.key).toBe('compra');
      expect(template?.currentVersion).toBe(1);
      expect(template?.archived).toBe(false);

      const version = await FieldTemplateVersion.findOne({ template: template?._id, version: 1 }).lean();
      expect(version?.fields).toEqual([STATUS_FIELD]);
    });

    it('forces the default key for targetType customer even when the body sends another one', async () => {
      const { cookie } = await seedTenantUser(['admin']);
      const app = buildTestApp(buildStores(createFakeFieldValueStore()));

      const res = await createTemplate(app, cookie, {
        targetType: 'customer',
        key: 'inventada',
        name: 'Cliente',
        fields: [STATUS_FIELD],
      });

      expect(res.status).toBe(201);
      const template = await FieldTemplate.findById(res.body.data.id).lean();
      expect(template?.key).toBe('default');
    });

    it('responds 409 for a duplicate {targetType,key} without creating a second template', async () => {
      const { tenant, cookie } = await seedTenantUser(['admin']);
      const app = buildTestApp(buildStores(createFakeFieldValueStore()));
      const body = {
        targetType: 'process',
        key: 'compra',
        name: 'Compra',
        fields: [STATUS_FIELD],
        stages: PROCESS_STAGES,
      };
      await createTemplate(app, cookie, body);

      const res = await createTemplate(app, cookie, body);

      expect(res.status).toBe(409);
      expect(await FieldTemplate.countDocuments({ Tenant: tenant._id, targetType: 'process', key: 'compra' })).toBe(1);
    });

    // AD-023: `stages` é a fonte de verdade da guarda de transição de Process
    // (CORE-09/17) — sem ela um template process não tem como ser usado por
    // nenhum Process, então a criação é bloqueada antes de qualquer escrita.
    it('responds 400 and creates nothing when targetType process is missing stages (AD-023)', async () => {
      const { cookie } = await seedTenantUser(['admin']);
      const app = buildTestApp(buildStores(createFakeFieldValueStore()));

      const res = await createTemplate(app, cookie, {
        targetType: 'process',
        key: 'compra',
        name: 'Compra',
        fields: [STATUS_FIELD],
      });

      expect(res.status).toBe(400);
      expect(await FieldTemplate.countDocuments()).toBe(0);
    });

    it('creates the template with stages for targetType process, and GET /current returns them (AD-023)', async () => {
      const { cookie } = await seedTenantUser(['admin']);
      const app = buildTestApp(buildStores(createFakeFieldValueStore()));

      const created = await createTemplate(app, cookie, {
        targetType: 'process',
        key: 'compra',
        name: 'Compra',
        fields: [STATUS_FIELD],
        stages: PROCESS_STAGES,
      });
      expect(created.status).toBe(201);

      const version = await FieldTemplateVersion.findOne({ template: created.body.data.id, version: 1 }).lean();
      expect(version?.stages).toEqual(PROCESS_STAGES);

      const res = await getCurrent(app, cookie, 'process', 'compra');
      expect(res.status).toBe(200);
      expect(res.body.data.stages).toEqual(PROCESS_STAGES);
    });

    // Prova o path inteiro (schema + service + repositório) para targetType
    // customer: `stages` continua rejeitado no request e nunca aparece na
    // resposta — a extensão do repositório/serviço não vaza nada para o
    // targetType que não tem `stage`.
    it('rejects stages in the request and never returns any for targetType customer (AD-023)', async () => {
      const { cookie } = await seedTenantUser(['admin']);
      const app = buildTestApp(buildStores(createFakeFieldValueStore()));

      const rejected = await createTemplate(app, cookie, {
        targetType: 'customer',
        name: 'Cliente',
        fields: [STATUS_FIELD],
        stages: PROCESS_STAGES,
      });
      expect(rejected.status).toBe(400);
      expect(await FieldTemplate.countDocuments()).toBe(0);

      await createTemplate(app, cookie, { targetType: 'customer', name: 'Cliente', fields: [STATUS_FIELD] });
      const res = await getCurrent(app, cookie, 'customer', 'default');

      expect(res.status).toBe(200);
      expect(res.body.data.stages).toBeUndefined();
    });

    it('responds 403 and creates nothing for gestor and operador (FLD-07)', async () => {
      const app = buildTestApp(buildStores(createFakeFieldValueStore()));
      const gestor = await seedTenantUser(['gestor']);
      const operador = await seedTenantUser(['operador']);
      const body = { targetType: 'process', key: 'compra', name: 'Compra', fields: [STATUS_FIELD] };

      const asGestor = await createTemplate(app, gestor.cookie, body);
      const asOperador = await createTemplate(app, operador.cookie, body);

      expect(asGestor.status).toBe(403);
      expect(asOperador.status).toBe(403);
      expect(await FieldTemplate.countDocuments()).toBe(0);
    });

    it('responds 400 for a body carrying a forged Tenant key (schema is strict, AD-010)', async () => {
      const { cookie } = await seedTenantUser(['admin']);
      const app = buildTestApp(buildStores(createFakeFieldValueStore()));

      const res = await createTemplate(app, cookie, {
        targetType: 'process',
        key: 'compra',
        name: 'Compra',
        fields: [STATUS_FIELD],
        tenantId: '65b0f3e2a1c4d5e6f7081920',
      });

      expect(res.status).toBe(400);
      expect(await FieldTemplate.countDocuments()).toBe(0);
    });

    it('responds 400 for a field tree deeper than the allowed limit, persisting nothing (FLD-14)', async () => {
      const { cookie } = await seedTenantUser(['admin']);
      const app = buildTestApp(buildStores(createFakeFieldValueStore()));
      const tooDeep: FieldDef = {
        fieldId: 'n1',
        label: 'N1',
        type: 'group',
        fields: [
          {
            fieldId: 'n2',
            label: 'N2',
            type: 'group',
            fields: [
              {
                fieldId: 'n3',
                label: 'N3',
                type: 'group',
                fields: [
                  {
                    fieldId: 'n4',
                    label: 'N4',
                    type: 'group',
                    fields: [{ fieldId: 'n5', label: 'N5', type: 'group', fields: [OBS_FIELD] }],
                  },
                ],
              },
            ],
          },
        ],
      };

      const res = await createTemplate(app, cookie, {
        targetType: 'process',
        key: 'fundo',
        name: 'Muito Fundo',
        fields: [tooDeep],
      });

      expect(res.status).toBe(400);
      expect(await FieldTemplate.countDocuments()).toBe(0);
    });

    it('responds 429 once template mutations exceed the rate limit window (FLD-16)', async () => {
      const { cookie } = await seedTenantUser(['admin']);
      const app = buildTestApp(buildStores(createFakeFieldValueStore()));
      const body = { targetType: 'process', key: 'compra', name: 'Compra', fields: [STATUS_FIELD] };

      let last: { status: number } | undefined;
      for (let i = 0; i < 6; i++) {
        last = await createTemplate(app, cookie, body);
      }

      expect(last?.status).toBe(429);
    });
  });

  describe('GET /field-templates/current', () => {
    it('returns the current version fields for any role of the tenant', async () => {
      const admin = await seedTenantUser(['admin']);
      const app = buildTestApp(buildStores(createFakeFieldValueStore()));
      await createTemplate(app, admin.cookie, {
        targetType: 'customer',
        name: 'Cliente',
        fields: [STATUS_FIELD],
      });

      const res = await getCurrent(app, admin.cookie, 'customer', 'default');

      expect(res.status).toBe(200);
      expect(res.body.data.template.currentVersion).toBe(1);
      expect(res.body.data.template.archived).toBe(false);
      expect(res.body.data.fields).toEqual([STATUS_FIELD]);
    });

    it('responds 404 when no template exists for the {targetType,key}', async () => {
      const { cookie } = await seedTenantUser(['operador']);
      const app = buildTestApp(buildStores(createFakeFieldValueStore()));

      const res = await getCurrent(app, cookie, 'process', 'inexistente');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /field-templates (WEB-07)', () => {
    it('lists every process template for the tenant as {key,label,archived}, archived included', async () => {
      const { cookie } = await seedTenantUser(['admin']);
      const app = buildTestApp(buildStores(createFakeFieldValueStore()));
      await createTemplate(app, cookie, {
        targetType: 'process',
        key: 'compra',
        name: 'Compra',
        fields: [STATUS_FIELD],
        stages: PROCESS_STAGES,
      });
      const toArchive = await createTemplate(app, cookie, {
        targetType: 'process',
        key: 'venda',
        name: 'Venda',
        fields: [STATUS_FIELD],
        stages: PROCESS_STAGES,
      });
      await request(app)
        .post(`/field-templates/${toArchive.body.data.id}/archive`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send();

      const res = await listTemplates(app, cookie, 'process');

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.items).toEqual(
        expect.arrayContaining([
          { key: 'compra', label: 'Compra', archived: false },
          { key: 'venda', label: 'Venda', archived: true },
        ]),
      );
    });

    it('returns the seeded default template for targetType customer', async () => {
      const { cookie } = await seedTenantUser(['admin']);
      const app = buildTestApp(buildStores(createFakeFieldValueStore()));
      await createTemplate(app, cookie, { targetType: 'customer', name: 'Cliente', fields: [STATUS_FIELD] });

      const res = await listTemplates(app, cookie, 'customer');

      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([{ key: 'default', label: 'Cliente', archived: false }]);
    });

    it("never returns another tenant's templates (AD-010)", async () => {
      const tenantA = await seedTenantUser(['admin']);
      const tenantB = await seedTenantUser(['admin']);
      const app = buildTestApp(buildStores(createFakeFieldValueStore()));
      await createTemplate(app, tenantA.cookie, {
        targetType: 'process',
        key: 'compra',
        name: 'Compra A',
        fields: [STATUS_FIELD],
        stages: PROCESS_STAGES,
      });
      await createTemplate(app, tenantB.cookie, {
        targetType: 'process',
        key: 'compra',
        name: 'Compra B',
        fields: [STATUS_FIELD],
        stages: PROCESS_STAGES,
      });

      const res = await listTemplates(app, tenantA.cookie, 'process');

      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([{ key: 'compra', label: 'Compra A', archived: false }]);
    });

    it('is open to any authenticated role, with no isAdmin gate (WEB-14)', async () => {
      const { cookie } = await seedTenantUser(['operador']);
      const app = buildTestApp(buildStores(createFakeFieldValueStore()));

      const res = await listTemplates(app, cookie, 'customer');

      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([]);
    });
  });

  describe('POST /field-templates/:id/versions', () => {
    const seedTemplate = async (
      app: express.Express,
      cookie: string,
      fields: FieldDef[] = [STATUS_FIELD, OBS_FIELD],
      stages: string[] = PROCESS_STAGES,
    ) => {
      const res = await createTemplate(app, cookie, {
        targetType: 'process',
        key: 'compra',
        name: 'Compra',
        fields,
        stages,
      });
      return res.body.data.id as string;
    };

    it('accepts an additive bump without any migration plan, advancing to version 2 (FLD-04/AC2)', async () => {
      const { cookie } = await seedTenantUser(['admin']);
      const store = createFakeFieldValueStore([{ id: 'r1', templateVersion: 1 }]);
      const app = buildTestApp(buildStores(store));
      const id = await seedTemplate(app, cookie, [STATUS_FIELD]);

      const res = await bumpTemplate(app, cookie, id, {
        expectedVersion: 1,
        fields: [STATUS_FIELD, OBS_FIELD],
        stages: PROCESS_STAGES,
      });

      expect(res.status).toBe(200);
      expect(res.body.data.currentVersion).toBe(2);
      expect(store.calls).toHaveLength(0);

      const template = await FieldTemplate.findById(id).lean();
      expect(template?.currentVersion).toBe(2);
      const v1 = await FieldTemplateVersion.findOne({ template: id, version: 1 }).lean();
      expect(v1?.fields).toEqual([STATUS_FIELD]);
      const v2 = await FieldTemplateVersion.findOne({ template: id, version: 2 }).lean();
      expect(v2?.fields).toEqual([STATUS_FIELD, OBS_FIELD]);
    });

    it('rejects a destructive bump without a migration plan with 400, persisting nothing (FLD-05/AC3)', async () => {
      const { cookie } = await seedTenantUser(['admin']);
      const store = createFakeFieldValueStore([{ id: 'r1', templateVersion: 1 }]);
      const app = buildTestApp(buildStores(store));
      const id = await seedTemplate(app, cookie);

      const res = await bumpTemplate(app, cookie, id, {
        expectedVersion: 1,
        fields: [STATUS_FIELD],
        stages: PROCESS_STAGES,
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('obs');
      expect(store.calls).toHaveLength(0);

      const template = await FieldTemplate.findById(id).lean();
      expect(template?.currentVersion).toBe(1);
      expect(await FieldTemplateVersion.countDocuments({ template: id })).toBe(1);
    });

    it('accepts a destructive bump covered by a migration plan, migrating the values and advancing (FLD-05)', async () => {
      const { tenant, cookie } = await seedTenantUser(['admin']);
      const store = createFakeFieldValueStore([{ id: 'r1', templateVersion: 1 }]);
      const app = buildTestApp(buildStores(store));
      const id = await seedTemplate(app, cookie);

      const res = await bumpTemplate(app, cookie, id, {
        expectedVersion: 1,
        fields: [STATUS_FIELD],
        stages: PROCESS_STAGES,
        migration: { obs: { action: 'discard' } },
      });

      expect(res.status).toBe(200);
      expect(res.body.data.currentVersion).toBe(2);
      expect(store.calls).toEqual([
        {
          tenantId: tenant.id,
          templateId: id,
          fromVersion: 1,
          toVersion: 2,
          migration: { obs: { action: 'discard' } },
        },
      ]);
      expect(store.records).toEqual([{ id: 'r1', templateVersion: 2 }]);

      const template = await FieldTemplate.findById(id).lean();
      expect(template?.currentVersion).toBe(2);
    });

    it('emits a structured log with actor, template, versions, affected fields and migrated records (FLD-13)', async () => {
      const { tenant, user, cookie } = await seedTenantUser(['admin']);
      const store = createFakeFieldValueStore([
        { id: 'r1', templateVersion: 1 },
        { id: 'r2', templateVersion: 1 },
      ]);
      const app = buildTestApp(buildStores(store));
      const id = await seedTemplate(app, cookie);
      const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

      const res = await bumpTemplate(app, cookie, id, {
        expectedVersion: 1,
        fields: [STATUS_FIELD],
        stages: PROCESS_STAGES,
        migration: { obs: { action: 'discard' } },
      });

      expect(res.status).toBe(200);
      const entries = spy.mock.calls
        .map(([line]) => JSON.parse(line as string))
        .filter((entry) => entry.event === 'fieldTemplate.destructive_migration');
      spy.mockRestore();

      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        event: 'fieldTemplate.destructive_migration',
        actor: user.id,
        tenant: tenant.id,
        template: id,
        fromVersion: 1,
        toVersion: 2,
        fieldsAffected: ['obs'],
        recordsMigrated: 2,
      });
      expect(Date.parse(entries[0].at)).not.toBeNaN();
    });

    it('rolls back completely when the migration fails midway: 500, no orphan record, pointer unchanged (FLD-12)', async () => {
      const { cookie } = await seedTenantUser(['admin']);
      const store = createFakeFieldValueStore([{ id: 'r1', templateVersion: 1 }]);
      const app = buildTestApp(buildStores(store));
      const id = await seedTemplate(app, cookie);
      store.failOnMigrate = true;

      const res = await bumpTemplate(app, cookie, id, {
        expectedVersion: 1,
        fields: [STATUS_FIELD],
        stages: PROCESS_STAGES,
        migration: { obs: { action: 'discard' } },
      });

      expect(res.status).toBe(500);
      expect(store.records).toEqual([{ id: 'r1', templateVersion: 1 }]);

      const template = await FieldTemplate.findById(id).lean();
      expect(template?.currentVersion).toBe(1);
      // O slot N+1 reivindicado é devolvido: o rollback é completo, não só do
      // ponteiro — sem isso o índice único guardaria uma versão inexistente.
      expect(await FieldTemplateVersion.countDocuments({ template: id })).toBe(1);
      const reread = await getCurrent(app, cookie, 'process', 'compra');
      expect(reread.body.data.template.currentVersion).toBe(1);
      expect(reread.body.data.fields).toEqual([STATUS_FIELD, OBS_FIELD]);
    });

    it('accepts a retry of the same bump after a failed migration, instead of a permanent 409 (FLD-15)', async () => {
      const { cookie } = await seedTenantUser(['admin']);
      const store = createFakeFieldValueStore([{ id: 'r1', templateVersion: 1 }]);
      const app = buildTestApp(buildStores(store));
      const id = await seedTemplate(app, cookie);
      store.failOnMigrate = true;

      const failed = await bumpTemplate(app, cookie, id, {
        expectedVersion: 1,
        fields: [STATUS_FIELD],
        stages: PROCESS_STAGES,
        migration: { obs: { action: 'discard' } },
      });
      expect(failed.status).toBe(500);

      store.failOnMigrate = false;
      const retry = await bumpTemplate(app, cookie, id, {
        expectedVersion: 1,
        fields: [STATUS_FIELD],
        stages: PROCESS_STAGES,
        migration: { obs: { action: 'discard' } },
      });

      expect(retry.status).toBe(200);
      expect(retry.body.data.currentVersion).toBe(2);
      expect(await FieldTemplateVersion.countDocuments({ template: id })).toBe(2);
      expect(store.records).toEqual([{ id: 'r1', templateVersion: 2 }]);
    });

    it('resolves two concurrent bumps on the same expectedVersion into one 200 and one 409 (FLD-17)', async () => {
      const { cookie } = await seedTenantUser(['admin']);
      const store = createFakeFieldValueStore();
      const app = buildTestApp(buildStores(store));
      const id = await seedTemplate(app, cookie, [STATUS_FIELD]);

      const results = await Promise.all([
        bumpTemplate(app, cookie, id, {
          expectedVersion: 1,
          fields: [STATUS_FIELD, OBS_FIELD],
          stages: PROCESS_STAGES,
        }),
        bumpTemplate(app, cookie, id, {
          expectedVersion: 1,
          fields: [STATUS_FIELD, OBS_FIELD],
          stages: PROCESS_STAGES,
        }),
      ]);

      expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
      expect(await FieldTemplateVersion.countDocuments({ template: id })).toBe(2);
      const template = await FieldTemplate.findById(id).lean();
      expect(template?.currentVersion).toBe(2);
    });

    // A guarda de concorrência precisa cobrir o caminho DESTRUTIVO, não só o
    // aditivo do teste acima: claimVersionSlot roda ANTES de migrateValues
    // (design.md), então só quem venceu a corrida do índice único chega a
    // migrar. Se a ordem fosse invertida, as duas requisições migrariam antes
    // de qualquer claim — nenhum teste que só conta status HTTP pegaria isso,
    // por isso a asserção central aqui é sobre `store.calls`, não sobre status.
    it('claims the version slot before running a concurrent destructive migration, never twice (FLD-17)', async () => {
      const { cookie } = await seedTenantUser(['admin']);
      const store = createFakeFieldValueStore([
        { id: 'r1', templateVersion: 1 },
        { id: 'r2', templateVersion: 1 },
      ]);
      const app = buildTestApp(buildStores(store));
      const id = await seedTemplate(app, cookie, [STATUS_FIELD, OBS_FIELD]);

      const destructiveBump = {
        expectedVersion: 1,
        fields: [STATUS_FIELD],
        stages: PROCESS_STAGES,
        migration: { obs: { action: 'discard' as const } },
      };
      const results = await Promise.all([
        bumpTemplate(app, cookie, id, destructiveBump),
        bumpTemplate(app, cookie, id, destructiveBump),
      ]);

      expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
      // Só o vencedor do claim chega a migrar — a migração nunca roda duas
      // vezes para o mesmo bump concorrente.
      expect(store.calls).toHaveLength(1);
      expect(await FieldTemplateVersion.countDocuments({ template: id })).toBe(2);
      const template = await FieldTemplate.findById(id).lean();
      expect(template?.currentVersion).toBe(2);
    });

    // AD-023: o schema de bump não tem `targetType` para exigir `stages`
    // estaticamente — a regra de negócio (bump de process sempre declara
    // stages) é do service, e roda ANTES de reivindicar qualquer slot.
    it('rejects a process bump without stages with 400, without claiming the version slot (AD-023)', async () => {
      const { cookie } = await seedTenantUser(['admin']);
      const app = buildTestApp(buildStores(createFakeFieldValueStore()));
      const id = await seedTemplate(app, cookie, [STATUS_FIELD]);

      const res = await bumpTemplate(app, cookie, id, { expectedVersion: 1, fields: [STATUS_FIELD, OBS_FIELD] });

      expect(res.status).toBe(400);
      expect(await FieldTemplateVersion.countDocuments({ template: id })).toBe(1);
      const template = await FieldTemplate.findById(id).lean();
      expect(template?.currentVersion).toBe(1);

      // Nenhum slot órfão ficou reivindicado: reaplicar o MESMO expectedVersion
      // com stages funciona normalmente, em vez de um 409 permanente.
      const retry = await bumpTemplate(app, cookie, id, {
        expectedVersion: 1,
        fields: [STATUS_FIELD, OBS_FIELD],
        stages: PROCESS_STAGES,
      });
      expect(retry.status).toBe(200);
      expect(retry.body.data.currentVersion).toBe(2);
    });

    it('persists the stages declared in a bump and returns them via GET /current (AD-023)', async () => {
      const { cookie } = await seedTenantUser(['admin']);
      const app = buildTestApp(buildStores(createFakeFieldValueStore()));
      const id = await seedTemplate(app, cookie, [STATUS_FIELD]);
      const bumpedStages = ['novo', 'finalizado'];

      const res = await bumpTemplate(app, cookie, id, {
        expectedVersion: 1,
        fields: [STATUS_FIELD, OBS_FIELD],
        stages: bumpedStages,
      });

      expect(res.status).toBe(200);
      const current = await getCurrent(app, cookie, 'process', 'compra');
      expect(current.body.data.stages).toEqual(bumpedStages);
    });

    it('responds 403 for a non-admin of the SAME tenant, without touching the template (FLD-07)', async () => {
      const admin = await seedTenantUser(['admin']);
      const app = buildTestApp(buildStores(createFakeFieldValueStore()));
      const id = await seedTemplate(app, admin.cookie, [STATUS_FIELD]);
      // Mesmo Tenant do admin: se fosse de outro tenant, findTemplateById já
      // devolveria 404 antes de isAdmin decidir — o 403 provaria isolamento
      // de Tenant, não RBAC (achado do Verifier independente, validation.md).
      const gestor = await addUserToTenant(admin.tenant, ['gestor']);

      const res = await bumpTemplate(app, gestor.cookie, id, { expectedVersion: 1, fields: [STATUS_FIELD, OBS_FIELD] });

      expect(res.status).toBe(403);
      expect(await FieldTemplateVersion.countDocuments({ template: id })).toBe(1);
    });
  });

  describe('POST /field-templates/:id/archive', () => {
    it('archives the template and keeps hydrate working for a record already on that version (FLD-08)', async () => {
      const { cookie } = await seedTenantUser(['admin']);
      const app = buildTestApp(buildStores(createFakeFieldValueStore()));
      const created = await createTemplate(app, cookie, {
        targetType: 'customer',
        name: 'Cliente',
        fields: [STATUS_FIELD],
      });

      const res = await request(app)
        .post(`/field-templates/${created.body.data.id}/archive`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.data.archived).toBe(true);
      const template = await FieldTemplate.findById(created.body.data.id).lean();
      expect(template?.archived).toBe(true);

      // O registro antigo continua renderizando contra a versão que ele usa:
      // arquivar bloqueia só NOVO uso, nunca a leitura de quem já aponta pra cá.
      // Bloquear novo uso é responsabilidade do CONSUMIDOR (crm-core, feature 3
      // — ver design.md Error Handling Strategy); esta feature só garante que o
      // sinal que ele precisa (a flag `archived`) chega correto na leitura.
      const afterArchive = await getCurrent(app, cookie, 'customer', 'default');
      expect(afterArchive.status).toBe(200);
      expect(afterArchive.body.data.template.archived).toBe(true);
      expect(hydrate(afterArchive.body.data.fields, { status: 'ativo' })).toEqual([
        { ...STATUS_FIELD, value: 'ativo' },
      ]);
    });

    it('is an idempotent no-op when the template is already archived (FLD-19)', async () => {
      const { cookie } = await seedTenantUser(['admin']);
      const app = buildTestApp(buildStores(createFakeFieldValueStore()));
      const created = await createTemplate(app, cookie, {
        targetType: 'customer',
        name: 'Cliente',
        fields: [STATUS_FIELD],
      });
      const archive = () =>
        request(app)
          .post(`/field-templates/${created.body.data.id}/archive`)
          .set('Cookie', cookie)
          .set('User-Agent', DEVICE)
          .send();
      await archive();

      const res = await archive();

      expect(res.status).toBe(200);
      expect(res.body.data.archived).toBe(true);
      const template = await FieldTemplate.findById(created.body.data.id).lean();
      expect(template?.archived).toBe(true);
    });

    it('responds 403 for a non-admin of the SAME tenant, leaving the template unarchived (FLD-07)', async () => {
      const admin = await seedTenantUser(['admin']);
      const app = buildTestApp(buildStores(createFakeFieldValueStore()));
      const created = await createTemplate(app, admin.cookie, {
        targetType: 'customer',
        name: 'Cliente',
        fields: [STATUS_FIELD],
      });
      // Mesmo Tenant do admin — ver nota da rota de bump acima.
      const operador = await addUserToTenant(admin.tenant, ['operador']);

      const res = await request(app)
        .post(`/field-templates/${created.body.data.id}/archive`)
        .set('Cookie', operador.cookie)
        .set('User-Agent', DEVICE)
        .send();

      expect(res.status).toBe(403);
      const template = await FieldTemplate.findById(created.body.data.id).lean();
      expect(template?.archived).toBe(false);
    });
  });

  describe('observability (FLD-18)', () => {
    // Prova que `withDbTiming` (FND-17) realmente envolve as operações do
    // repositório, não só o wrapper genérico já testado por
    // `db.metric.unit.test.ts`. Achado do Verifier independente
    // (validation.md, M8/M9): remover TODOS os `withDbTiming` do repositório
    // deixava a suíte inteira verde — nenhuma assertion observava a
    // instrumentação das operações novas.
    it('records dbReqResTime for every fieldTemplate repository operation exercised by a full flow', async () => {
      const { cookie } = await seedTenantUser(['admin']);
      const app = buildTestApp(buildStores(createFakeFieldValueStore()));

      const created = await createTemplate(app, cookie, {
        targetType: 'customer',
        name: 'Cliente',
        fields: [STATUS_FIELD],
      });
      const id = created.body.data.id as string;
      await getCurrent(app, cookie, 'customer', 'default');
      await bumpTemplate(app, cookie, id, { expectedVersion: 1, fields: [STATUS_FIELD, OBS_FIELD] });
      await request(app).post(`/field-templates/${id}/archive`).set('Cookie', cookie).set('User-Agent', DEVICE).send();

      const metric = await dbReqResTime.get();
      const recordedOperations = new Set(metric.values.map((value) => value.labels.operation));

      for (const operation of [
        'fieldTemplate.createTemplate',
        'fieldTemplate.claimVersionSlot',
        'fieldTemplate.findTemplateByTargetKey',
        'fieldTemplate.findCurrentVersion',
        'fieldTemplate.findTemplateById',
        'fieldTemplate.updateCurrentVersion',
        'fieldTemplate.archiveTemplate',
      ]) {
        expect(recordedOperations, `esperava "${operation}" instrumentado`).toContain(operation);
      }
    });

    it('records dbReqResTime for releaseVersionSlot when a destructive migration fails', async () => {
      const { cookie } = await seedTenantUser(['admin']);
      const store = createFakeFieldValueStore([{ id: 'r1', templateVersion: 1 }]);
      const app = buildTestApp(buildStores(store));
      const created = await createTemplate(app, cookie, {
        targetType: 'process',
        key: 'compra',
        name: 'Compra',
        fields: [STATUS_FIELD, OBS_FIELD],
        stages: PROCESS_STAGES,
      });
      store.failOnMigrate = true;

      await bumpTemplate(app, cookie, created.body.data.id, {
        expectedVersion: 1,
        fields: [STATUS_FIELD],
        stages: PROCESS_STAGES,
        migration: { obs: { action: 'discard' } },
      });

      const metric = await dbReqResTime.get();
      const recordedOperations = new Set(metric.values.map((value) => value.labels.operation));
      expect(recordedOperations).toContain('fieldTemplate.releaseVersionSlot');
    });
  });
});
