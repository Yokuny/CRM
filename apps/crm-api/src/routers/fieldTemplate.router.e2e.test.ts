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
      const body = { targetType: 'process', key: 'compra', name: 'Compra', fields: [STATUS_FIELD] };
      await createTemplate(app, cookie, body);

      const res = await createTemplate(app, cookie, body);

      expect(res.status).toBe(409);
      expect(await FieldTemplate.countDocuments({ Tenant: tenant._id, targetType: 'process', key: 'compra' })).toBe(1);
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

  describe('POST /field-templates/:id/versions', () => {
    const seedTemplate = async (
      app: express.Express,
      cookie: string,
      fields: FieldDef[] = [STATUS_FIELD, OBS_FIELD],
    ) => {
      const res = await createTemplate(app, cookie, {
        targetType: 'process',
        key: 'compra',
        name: 'Compra',
        fields,
      });
      return res.body.data.id as string;
    };

    it('accepts an additive bump without any migration plan, advancing to version 2 (FLD-04/AC2)', async () => {
      const { cookie } = await seedTenantUser(['admin']);
      const store = createFakeFieldValueStore([{ id: 'r1', templateVersion: 1 }]);
      const app = buildTestApp(buildStores(store));
      const id = await seedTemplate(app, cookie, [STATUS_FIELD]);

      const res = await bumpTemplate(app, cookie, id, { expectedVersion: 1, fields: [STATUS_FIELD, OBS_FIELD] });

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

      const res = await bumpTemplate(app, cookie, id, { expectedVersion: 1, fields: [STATUS_FIELD] });

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
        migration: { obs: { action: 'discard' } },
      });

      expect(res.status).toBe(500);
      expect(store.records).toEqual([{ id: 'r1', templateVersion: 1 }]);

      const template = await FieldTemplate.findById(id).lean();
      expect(template?.currentVersion).toBe(1);
      const reread = await getCurrent(app, cookie, 'process', 'compra');
      expect(reread.body.data.template.currentVersion).toBe(1);
      expect(reread.body.data.fields).toEqual([STATUS_FIELD, OBS_FIELD]);
    });

    it('resolves two concurrent bumps on the same expectedVersion into one 200 and one 409 (FLD-17)', async () => {
      const { cookie } = await seedTenantUser(['admin']);
      const store = createFakeFieldValueStore();
      const app = buildTestApp(buildStores(store));
      const id = await seedTemplate(app, cookie, [STATUS_FIELD]);

      const results = await Promise.all([
        bumpTemplate(app, cookie, id, { expectedVersion: 1, fields: [STATUS_FIELD, OBS_FIELD] }),
        bumpTemplate(app, cookie, id, { expectedVersion: 1, fields: [STATUS_FIELD, OBS_FIELD] }),
      ]);

      expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
      expect(await FieldTemplateVersion.countDocuments({ template: id })).toBe(2);
      const template = await FieldTemplate.findById(id).lean();
      expect(template?.currentVersion).toBe(2);
    });

    it('responds 403 for a non-admin without touching the template (FLD-07)', async () => {
      const admin = await seedTenantUser(['admin']);
      const app = buildTestApp(buildStores(createFakeFieldValueStore()));
      const id = await seedTemplate(app, admin.cookie, [STATUS_FIELD]);
      const gestor = await seedTenantUser(['gestor']);

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
      const afterArchive = await getCurrent(app, cookie, 'customer', 'default');
      expect(afterArchive.status).toBe(200);
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

    it('responds 403 for a non-admin, leaving the template unarchived (FLD-07)', async () => {
      const admin = await seedTenantUser(['admin']);
      const app = buildTestApp(buildStores(createFakeFieldValueStore()));
      const created = await createTemplate(app, admin.cookie, {
        targetType: 'customer',
        name: 'Cliente',
        fields: [STATUS_FIELD],
      });
      const operador = await seedTenantUser(['operador']);

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
});
