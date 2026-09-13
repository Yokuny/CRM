import crypto from 'node:crypto';
import type { Role } from '@crm/contracts';
import { Appointment, connect, disconnect, hashToken, Professional, Session, syncIndexes, Tenant, User } from '@crm/db';
import cookieParser from 'cookie-parser';
import express from 'express';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../config/env.config.js';
import type { AuthDeps } from '../middlewares/authentication.middleware.js';
import { createAuthMiddleware } from '../middlewares/authentication.middleware.js';
import { errorHandler } from '../middlewares/errorHandler.middleware.js';
import { createProfessionalRouter } from './professional.router.js';

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
  app.use('/professionals', createProfessionalRouter({ validToken }));
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

const validWeeklySchedule = [{ weekday: 1, start: '09:00', end: '12:00' }];

describe('professional routes', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
    await syncIndexes();
  });

  afterEach(async () => {
    await Promise.all([
      Appointment.deleteMany({}),
      Professional.deleteMany({}),
      Session.deleteMany({}),
      User.deleteMany({}),
      Tenant.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await disconnect();
  });

  describe('POST /professionals (spec.md P1 "Configuração de agenda"/SCH-01)', () => {
    it('creates a Professional scoped to the session Tenant, with active defaulting to true', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const app = buildTestApp();

      const res = await request(app)
        .post('/professionals')
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ name: 'Dra. Ana', slotDurationMinutes: 30, weeklySchedule: validWeeklySchedule });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Dra. Ana');
      expect(res.body.data.active).toBe(true);
      const persisted = await Professional.findById(res.body.data.id).lean();
      expect(persisted?.Tenant.toString()).toBe(tenant._id.toString());
    });

    it('responds 400 for a window with end<=start, creating nothing (spec.md SCH-02)', async () => {
      const { cookie } = await seedTenantUser(['operador']);
      const app = buildTestApp();

      const res = await request(app)
        .post('/professionals')
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({
          name: 'Dra. Ana',
          slotDurationMinutes: 30,
          weeklySchedule: [{ weekday: 1, start: '12:00', end: '09:00' }],
        });

      expect(res.status).toBe(400);
      expect(await Professional.countDocuments({})).toBe(0);
    });

    it('responds 400 for overlapping windows in the same weekday, creating nothing (spec.md SCH-03)', async () => {
      const { cookie } = await seedTenantUser(['operador']);
      const app = buildTestApp();

      const res = await request(app)
        .post('/professionals')
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({
          name: 'Dra. Ana',
          slotDurationMinutes: 30,
          weeklySchedule: [
            { weekday: 1, start: '09:00', end: '12:00' },
            { weekday: 1, start: '11:00', end: '13:00' },
          ],
        });

      expect(res.status).toBe(400);
      expect(await Professional.countDocuments({})).toBe(0);
    });

    it('responds 400 for slotDurationMinutes out of the 5..480 range, creating nothing (spec.md SCH-02)', async () => {
      const { cookie } = await seedTenantUser(['operador']);
      const app = buildTestApp();

      const res = await request(app)
        .post('/professionals')
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ name: 'Dra. Ana', slotDurationMinutes: 3, weeklySchedule: validWeeklySchedule });

      expect(res.status).toBe(400);
      expect(await Professional.countDocuments({})).toBe(0);
    });

    it('responds 403 for a caller without canOperate, creating nothing (spec.md SCH-07)', async () => {
      const { cookie } = await seedTenantUser([]);
      const app = buildTestApp();

      const res = await request(app)
        .post('/professionals')
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ name: 'Dra. Ana', slotDurationMinutes: 30, weeklySchedule: validWeeklySchedule });

      expect(res.status).toBe(403);
      expect(await Professional.countDocuments({})).toBe(0);
    });
  });

  describe('GET /professionals', () => {
    it('responds 200 with the paginated list scoped to the session tenant (never another tenant)', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      await Professional.create({
        Tenant: tenant._id,
        name: 'Meu Profissional',
        slotDurationMinutes: 30,
        weeklySchedule: validWeeklySchedule,
      });
      const other = await seedTenantUser(['admin']);
      await Professional.create({
        Tenant: other.tenant._id,
        name: 'De Outro Tenant',
        slotDurationMinutes: 30,
        weeklySchedule: validWeeklySchedule,
      });
      const app = buildTestApp();

      const res = await request(app).get('/professionals').set('Cookie', cookie).set('User-Agent', DEVICE);

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.items.map((item: { name: string }) => item.name)).toEqual(['Meu Profissional']);
    });

    it('responds 403 for a caller without canOperate, without returning any professional data (spec.md SCH-07)', async () => {
      const { tenant, cookie } = await seedTenantUser([]);
      await Professional.create({
        Tenant: tenant._id,
        name: 'Profissional',
        slotDurationMinutes: 30,
        weeklySchedule: validWeeklySchedule,
      });
      const app = buildTestApp();

      const res = await request(app).get('/professionals').set('Cookie', cookie).set('User-Agent', DEVICE);

      expect(res.status).toBe(403);
      expect(res.body.data).toBeUndefined();
    });
  });

  describe('GET /professionals/:id', () => {
    it('responds 200 with the Professional for its own tenant', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const professional = await Professional.create({
        Tenant: tenant._id,
        name: 'Dra. Ana',
        slotDurationMinutes: 30,
        weeklySchedule: validWeeklySchedule,
      });
      const app = buildTestApp();

      const res = await request(app)
        .get(`/professionals/${professional._id.toString()}`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Dra. Ana');
    });

    it("responds 404 for an id belonging to another tenant's Professional", async () => {
      const { cookie } = await seedTenantUser(['operador']);
      const owner = await seedTenantUser(['admin']);
      const professional = await Professional.create({
        Tenant: owner.tenant._id,
        name: 'Dra. Ana',
        slotDurationMinutes: 30,
        weeklySchedule: validWeeklySchedule,
      });
      const app = buildTestApp();

      const res = await request(app)
        .get(`/professionals/${professional._id.toString()}`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(404);
    });

    it('responds 403 for a caller without canOperate (spec.md SCH-07)', async () => {
      const { tenant, cookie } = await seedTenantUser([]);
      const professional = await Professional.create({
        Tenant: tenant._id,
        name: 'Dra. Ana',
        slotDurationMinutes: 30,
        weeklySchedule: validWeeklySchedule,
      });
      const app = buildTestApp();

      const res = await request(app)
        .get(`/professionals/${professional._id.toString()}`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /professionals/:id', () => {
    it('updates only the fields informed, leaving the rest untouched', async () => {
      const { tenant, cookie } = await seedTenantUser(['gestor']);
      const professional = await Professional.create({
        Tenant: tenant._id,
        name: 'Dra. Ana',
        slotDurationMinutes: 30,
        weeklySchedule: validWeeklySchedule,
      });
      const app = buildTestApp();

      const res = await request(app)
        .patch(`/professionals/${professional._id.toString()}`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ slotDurationMinutes: 45 });

      expect(res.status).toBe(200);
      expect(res.body.data.slotDurationMinutes).toBe(45);
      expect(res.body.data.name).toBe('Dra. Ana');
    });

    it('responds 400 for a window with end<=start, leaving the Professional untouched (spec.md SCH-02)', async () => {
      const { tenant, cookie } = await seedTenantUser(['gestor']);
      const professional = await Professional.create({
        Tenant: tenant._id,
        name: 'Dra. Ana',
        slotDurationMinutes: 30,
        weeklySchedule: validWeeklySchedule,
      });
      const app = buildTestApp();

      const res = await request(app)
        .patch(`/professionals/${professional._id.toString()}`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ weeklySchedule: [{ weekday: 1, start: '12:00', end: '09:00' }] });

      expect(res.status).toBe(400);
      const persisted = await Professional.findById(professional._id).lean();
      expect(persisted?.slotDurationMinutes).toBe(30);
    });

    it("responds 404 for an id belonging to another tenant's Professional", async () => {
      const { cookie } = await seedTenantUser(['gestor']);
      const owner = await seedTenantUser(['admin']);
      const professional = await Professional.create({
        Tenant: owner.tenant._id,
        name: 'Dra. Ana',
        slotDurationMinutes: 30,
        weeklySchedule: validWeeklySchedule,
      });
      const app = buildTestApp();

      const res = await request(app)
        .patch(`/professionals/${professional._id.toString()}`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ slotDurationMinutes: 60 });

      expect(res.status).toBe(404);
    });

    it('responds 403 for a caller without canOperate, leaving the Professional untouched (spec.md SCH-07)', async () => {
      const { tenant, cookie } = await seedTenantUser([]);
      const professional = await Professional.create({
        Tenant: tenant._id,
        name: 'Dra. Ana',
        slotDurationMinutes: 30,
        weeklySchedule: validWeeklySchedule,
      });
      const app = buildTestApp();

      const res = await request(app)
        .patch(`/professionals/${professional._id.toString()}`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ slotDurationMinutes: 60 });

      expect(res.status).toBe(403);
      const persisted = await Professional.findById(professional._id).lean();
      expect(persisted?.slotDurationMinutes).toBe(30);
    });

    it('with {active:false} leaves an existing Appointment for that professional completely untouched (spec.md SCH-05)', async () => {
      const { tenant, cookie } = await seedTenantUser(['gestor']);
      const professional = await Professional.create({
        Tenant: tenant._id,
        name: 'Dra. Ana',
        slotDurationMinutes: 30,
        weeklySchedule: validWeeklySchedule,
      });
      const start = new Date('2026-02-02T12:00:00.000Z');
      const end = new Date('2026-02-02T12:30:00.000Z');
      const appointment = await Appointment.create({
        Tenant: tenant._id,
        kind: 'block',
        professional: professional._id,
        title: 'Bloqueio',
        start,
        end,
        status: 'confirmed',
        source: 'operator',
      });
      const beforePatch = await Appointment.findById(appointment._id).lean();
      const app = buildTestApp();

      const res = await request(app)
        .patch(`/professionals/${professional._id.toString()}`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ active: false });

      expect(res.status).toBe(200);
      expect(res.body.data.active).toBe(false);
      const afterPatch = await Appointment.findById(appointment._id).lean();
      expect(afterPatch).toEqual(beforePatch);
      expect(afterPatch?.status).toBe('confirmed');
    });
  });
});
