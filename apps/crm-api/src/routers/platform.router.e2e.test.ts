import crypto from 'node:crypto';
import {
  connect,
  disconnect,
  FieldTemplate,
  FieldTemplateVersion,
  hashToken,
  Invite,
  Session,
  Tenant,
  User,
} from '@crm/db';
import cookieParser from 'cookie-parser';
import express from 'express';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../config/env.config.js';
import type { AuthDeps } from '../middlewares/authentication.middleware.js';
import { createAuthMiddleware } from '../middlewares/authentication.middleware.js';
import { errorHandler } from '../middlewares/errorHandler.middleware.js';
import { createNoopFieldValueStore } from '../providers/fieldValueStore/index.js';
import type { MailProvider } from '../providers/mail/index.js';
import { createFieldTemplateRouter } from './fieldTemplate.router.js';
import { createPlatformRouter } from './platform.router.js';

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

const buildTestApp = (mailProvider: MailProvider) => {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  const { validToken } = createAuthMiddleware(buildAuthDeps());
  app.use(
    '/platform',
    createPlatformRouter({ validToken, mailProvider, inviteBaseUrl: 'http://localhost:5173/invite' }),
  );
  // Montado no MESMO app da provisão: a prova de FLD-09 é ler o template pela
  // rota real logo após provisionar, sem nenhuma chamada de setup no meio.
  app.use(
    '/field-templates',
    createFieldTemplateRouter({
      validToken,
      fieldValueStores: { customer: createNoopFieldValueStore(), process: createNoopFieldValueStore() },
    }),
  );
  app.use(errorHandler);
  return app;
};

const alwaysSentMailProvider: MailProvider = { send: async () => ({ sent: true }) };

describe('platform routes', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
  });

  afterEach(async () => {
    await Promise.all([
      FieldTemplateVersion.deleteMany({}),
      FieldTemplate.deleteMany({}),
      Invite.deleteMany({}),
      Session.deleteMany({}),
      User.deleteMany({}),
      Tenant.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await disconnect();
  });

  describe('POST /platform/tenants', () => {
    it('creates a Tenant with status provisioned and returns its id for a platform admin (FND-01/AC1)', async () => {
      const admin = await User.create({
        name: 'Root Admin',
        email: 'root@platform.com',
        password: 'hash',
        isPlatformAdmin: true,
        role: [],
      });
      const cookie = await issueSessionCookie(admin.id);

      const res = await request(buildTestApp(alwaysSentMailProvider))
        .post('/platform/tenants')
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ name: 'Empresa Alpha', document: '11.222.333/0001-81' });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toMatch(/^[0-9a-f]{24}$/);

      const tenant = await Tenant.findById(res.body.data.id).lean();
      expect(tenant).not.toBeNull();
      expect(tenant?.name).toBe('Empresa Alpha');
      expect(tenant?.document).toBe('11222333000181');
      expect(tenant?.status).toBe('provisioned');
    });

    it('responds 403 and creates nothing when the caller lacks isPlatformAdmin (FND-01/AC3)', async () => {
      const tenant = await Tenant.create({ name: 'Empresa Existente', document: '99999999000199', status: 'active' });
      const regularUser = await User.create({
        name: 'Fulano',
        email: 'fulano@empresa.com',
        password: 'hash',
        Tenant: tenant._id,
        role: ['admin'],
      });
      const cookie = await issueSessionCookie(regularUser.id);
      const before = await Tenant.countDocuments();

      const res = await request(buildTestApp(alwaysSentMailProvider))
        .post('/platform/tenants')
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ name: 'Empresa Beta', document: '22222222000122' });

      expect(res.status).toBe(403);
      expect(await Tenant.countDocuments()).toBe(before);
    });

    // FLD-09: entre a provisão e a leitura NÃO existe nenhuma chamada de
    // setup de template — é exatamente isso que o Independent Test do spec
    // pede ("sem nenhuma chamada extra de setup"). O leitor é um `operador`
    // recém-vinculado, o papel mais fraco: se o seed não tivesse rodado na
    // provisão, esta rota devolveria 404.
    it('seeds the default customer template on provisioning: GET /field-templates/current returns the status field with its 3 default options, with no extra setup call (FLD-09)', async () => {
      const app = buildTestApp(alwaysSentMailProvider);
      const platformAdmin = await User.create({
        name: 'Root Admin',
        email: 'root@platform.com',
        password: 'hash',
        isPlatformAdmin: true,
        role: [],
      });
      const platformCookie = await issueSessionCookie(platformAdmin.id);

      const provisionRes = await request(app)
        .post('/platform/tenants')
        .set('Cookie', platformCookie)
        .set('User-Agent', DEVICE)
        .send({ name: 'Empresa Semeada', document: '77777777000177' });
      expect(provisionRes.status).toBe(201);
      const tenantId = provisionRes.body.data.id as string;

      const member = await User.create({
        name: 'Operador',
        email: 'operador@empresa-semeada.com',
        password: 'hash',
        Tenant: tenantId,
        role: ['operador'],
      });
      const memberCookie = await issueSessionCookie(member.id);

      const res = await request(app)
        .get('/field-templates/current')
        .query({ targetType: 'customer', key: 'default' })
        .set('Cookie', memberCookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(200);
      expect(res.body.data.template.name).toBe('Cliente');
      expect(res.body.data.template.currentVersion).toBe(1);
      expect(res.body.data.template.archived).toBe(false);
      expect(res.body.data.fields).toEqual([
        {
          fieldId: 'status',
          label: 'Status',
          type: 'status',
          required: true,
          options: [
            { key: 'novo', label: 'Novo', color: '#3B82F6', order: 0 },
            { key: 'ativo', label: 'Ativo', color: '#22C55E', order: 1 },
            { key: 'inativo', label: 'Inativo', color: '#94A3B8', order: 2 },
          ],
        },
      ]);
    });
  });

  describe('POST /platform/tenants/:id/invites', () => {
    const seedAdminAndTenant = async () => {
      const tenant = await Tenant.create({ name: 'Empresa Gamma', document: '33333333000133', status: 'provisioned' });
      const admin = await User.create({
        name: 'Root Admin',
        email: `root-${tenant.id}@platform.com`,
        password: 'hash',
        isPlatformAdmin: true,
        role: [],
      });
      const cookie = await issueSessionCookie(admin.id);
      return { tenant, cookie };
    };

    it('creates an Invite with hashed token, role admin and expiresAt +7 days, and sends the e-mail (FND-02)', async () => {
      const { tenant, cookie } = await seedAdminAndTenant();
      const before = Date.now();

      // Envia 'operador' de propósito: este endpoint convida especificamente
      // o primeiro admin (FND-02/AC2) — o papel do body nunca deve vazar para
      // o Invite criado, mesmo que o schema aceite outros papéis (reuso futuro
      // de FND-20). Se o servidor apenas repassasse `data.role`, este teste
      // pegaria a regressão.
      const res = await request(buildTestApp(alwaysSentMailProvider))
        .post(`/platform/tenants/${tenant.id}/invites`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ email: 'convidado@empresa.com', role: 'operador' });

      expect(res.status).toBe(201);

      const invite = await Invite.findById(res.body.data.id).lean();
      expect(invite).not.toBeNull();
      expect(invite?.Tenant.toString()).toBe(tenant.id);
      expect(invite?.email).toBe('convidado@empresa.com');
      expect(invite?.role).toBe('admin');
      expect(invite?.status).toBe('pending');
      expect(invite?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(invite?.sentAt).toBeInstanceOf(Date);
      const expectedExpiry = before + 7 * 24 * 60 * 60 * 1000;
      expect(invite?.expiresAt.getTime()).toBeGreaterThan(expectedExpiry - 5000);
      expect(invite?.expiresAt.getTime()).toBeLessThan(expectedExpiry + 5000);
    });

    it('responds 202 and still persists the invite without sentAt when the mail provider fails to send (FND-12)', async () => {
      const { tenant, cookie } = await seedAdminAndTenant();
      const failingMailProvider: MailProvider = { send: async () => ({ sent: false }) };

      const res = await request(buildTestApp(failingMailProvider))
        .post(`/platform/tenants/${tenant.id}/invites`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ email: 'semenvio@empresa.com', role: 'admin' });

      expect(res.status).toBe(202);
      expect(res.body.message).toMatch(/falhou/i);

      const invite = await Invite.findById(res.body.data.id).lean();
      expect(invite).not.toBeNull();
      expect(invite?.status).toBe('pending');
      expect(invite?.sentAt).toBeUndefined();
    });

    it('reissues the invite when the same e-mail already has a pending one in the same Tenant, revoking the old token (FND-13)', async () => {
      const { tenant, cookie } = await seedAdminAndTenant();
      const app = buildTestApp(alwaysSentMailProvider);

      const first = await request(app)
        .post(`/platform/tenants/${tenant.id}/invites`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ email: 'duplicado@empresa.com', role: 'admin' });
      expect(first.status).toBe(201);

      const second = await request(app)
        .post(`/platform/tenants/${tenant.id}/invites`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ email: 'duplicado@empresa.com', role: 'admin' });

      // Reaproveita: 201 de novo (nunca 409), um segundo Invite é criado, e o
      // primeiro é revogado — nunca dois `pending` válidos ao mesmo tempo.
      expect(second.status).toBe(201);
      expect(second.body.data.id).not.toBe(first.body.data.id);

      const oldInvite = await Invite.findById(first.body.data.id).lean();
      expect(oldInvite?.status).toBe('revoked');

      const newInvite = await Invite.findById(second.body.data.id).lean();
      expect(newInvite?.status).toBe('pending');

      const pendingForPair = await Invite.countDocuments({
        Tenant: tenant._id,
        email: 'duplicado@empresa.com',
        status: 'pending',
      });
      expect(pendingForPair).toBe(1);
    });

    it('responds 409 when the invited e-mail already belongs to a user of this same Tenant (FND-01/AC4)', async () => {
      const { tenant, cookie } = await seedAdminAndTenant();
      await User.create({
        name: 'Já Membro',
        email: 'jamembro@empresa.com',
        password: 'hash',
        Tenant: tenant._id,
        role: ['operador'],
      });

      const res = await request(buildTestApp(alwaysSentMailProvider))
        .post(`/platform/tenants/${tenant.id}/invites`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ email: 'jamembro@empresa.com', role: 'admin' });

      expect(res.status).toBe(409);
      expect(await Invite.countDocuments({ Tenant: tenant._id, email: 'jamembro@empresa.com' })).toBe(0);
    });

    it('responds 403 and creates nothing when the caller lacks isPlatformAdmin', async () => {
      const tenant = await Tenant.create({ name: 'Empresa Delta', document: '44444444000144', status: 'active' });
      const regularUser = await User.create({
        name: 'Fulano',
        email: 'fulano2@empresa.com',
        password: 'hash',
        Tenant: tenant._id,
        role: ['admin'],
      });
      const cookie = await issueSessionCookie(regularUser.id);

      const res = await request(buildTestApp(alwaysSentMailProvider))
        .post(`/platform/tenants/${tenant.id}/invites`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ email: 'novo@empresa.com', role: 'admin' });

      expect(res.status).toBe(403);
      expect(await Invite.countDocuments({ Tenant: tenant._id })).toBe(0);
    });

    it('responds 429 once invite requests for the same e-mail exceed the rate limit window (FND-14)', async () => {
      const { tenant, cookie } = await seedAdminAndTenant();
      const app = buildTestApp(alwaysSentMailProvider);
      const email = 'ratelimited@empresa.com';

      let last: { status: number } | undefined;
      for (let i = 0; i < 6; i++) {
        last = await request(app)
          .post(`/platform/tenants/${tenant.id}/invites`)
          .set('Cookie', cookie)
          .set('User-Agent', DEVICE)
          .send({ email, role: 'admin' });
      }

      expect(last?.status).toBe(429);
    });
  });
});
