import crypto from 'node:crypto';
import type { Role } from '@crm/contracts';
import {
  Appointment,
  Customer,
  connect,
  dateInDisplayTz,
  disconnect,
  hashToken,
  Professional,
  Session,
  Space,
  syncIndexes,
  Tenant,
  timeInDisplayTz,
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
import { createAppointmentRouter } from './appointment.router.js';

const DEVICE = 'test-agent';

// Sem `mongoose` aqui (AD-010/boundary estrutural: só packages/db importa
// mongoose) — mesmo padrão de order.router.e2e.test.ts.
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
  app.use('/appointments', createAppointmentRouter({ validToken }));
  app.use(errorHandler);
  return app;
};

// Cada teste recebe seu PRÓPRIO Tenant — mesmo padrão de order.router.e2e.test.ts.
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

// Grade estreita (só segunda 09:00-10:00) — de propósito, para o teste de
// "encaixe" provar que o operador ignora a grade (SCH-30) escolhendo um
// horário claramente fora dela.
const seedProfessional = (tenantId: string, overrides: Partial<Record<string, unknown>> = {}) =>
  Professional.create({
    Tenant: tenantId,
    name: 'Dra. Ana',
    slotDurationMinutes: 30,
    weeklySchedule: [{ weekday: 1, start: '09:00', end: '10:00' }],
    ...overrides,
  });

const seedCustomer = (tenantId: string, overrides: Partial<Record<string, unknown>> = {}) =>
  Customer.create({
    Tenant: tenantId,
    name: 'Cliente Teste',
    phone: '11900000000',
    template: randomId(),
    templateVersion: 1,
    values: {},
    ...overrides,
  });

const seedAppointment = (tenantId: string, overrides: Partial<Record<string, unknown>> = {}) =>
  Appointment.create({
    Tenant: tenantId,
    kind: 'appointment',
    professional: randomId(),
    customer: randomId(),
    start: new Date('2026-01-03T12:00:00.000Z'),
    end: new Date('2026-01-03T12:30:00.000Z'),
    status: 'pending',
    source: 'operator',
    ...overrides,
  });

const seedBlock = (tenantId: string, professionalId: string, overrides: Partial<Record<string, unknown>> = {}) =>
  Appointment.create({
    Tenant: tenantId,
    kind: 'block',
    professional: professionalId,
    title: 'Bloqueio',
    start: new Date('2026-01-03T12:00:00.000Z'),
    end: new Date('2026-01-03T13:00:00.000Z'),
    status: 'confirmed',
    source: 'operator',
    ...overrides,
  });

// Converte um instante em `{date, time}` na hora de exibição — usado nos
// testes de comparecimento (T25), onde "antes"/"depois do início" precisa
// ser relativo ao `Date.now()` real da execução, nunca uma data cravada (ao
// contrário do encaixe comum, createManualAppointment ignora passado/futuro,
// mas markAttendance não — SCH-34).
const wallClockParts = (instant: Date): { date: string; time: string } => ({
  date: dateInDisplayTz(instant),
  time: timeInDisplayTz(instant),
});

describe('appointment routes (spec.md P1 "Operador opera a agenda no CRM")', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
    await syncIndexes();
  });

  afterEach(async () => {
    await Promise.all([
      Appointment.deleteMany({}),
      Professional.deleteMany({}),
      Space.deleteMany({}),
      Customer.deleteMany({}),
      Session.deleteMany({}),
      User.deleteMany({}),
      Tenant.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await disconnect();
  });

  describe('GET /appointments (SCH-29)', () => {
    it('returns only appointments/blocks with start in [from, to), scoped to the session Tenant', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const inRange = await seedAppointment(tenant._id.toString(), { start: new Date('2026-01-05T12:00:00.000Z') });
      await seedAppointment(tenant._id.toString(), { start: new Date('2026-02-01T12:00:00.000Z') }); // out of range
      const other = await seedTenantUser(['admin']);
      await seedAppointment(other.tenant._id.toString(), { start: new Date('2026-01-05T12:00:00.000Z') });
      const app = buildTestApp();

      const res = await request(app)
        .get('/appointments?from=2026-01-01&to=2026-01-08')
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(200);
      expect(res.body.data.map((item: { id: string }) => item.id)).toEqual([inRange._id.toString()]);
    });

    it('accepts optional professional/space filters', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const professional = await seedProfessional(tenant._id.toString());
      await seedAppointment(tenant._id.toString(), {
        professional: professional._id,
        start: new Date('2026-01-05T12:00:00.000Z'),
      });
      const app = buildTestApp();

      const res = await request(app)
        .get(`/appointments?from=2026-01-01&to=2026-01-08&professional=${professional._id.toString()}`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('responds 400 when the range exceeds 42 days, without querying anything', async () => {
      const { cookie } = await seedTenantUser(['operador']);
      const app = buildTestApp();

      const res = await request(app)
        .get('/appointments?from=2026-01-01&to=2026-03-01')
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(400);
    });

    it('responds 403 for a caller without canOperate', async () => {
      const { cookie } = await seedTenantUser([]);
      const app = buildTestApp();

      const res = await request(app)
        .get('/appointments?from=2026-01-01&to=2026-01-08')
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(403);
    });
  });

  describe('GET /appointments/upcoming (SCH-38)', () => {
    it('returns the next active Appointment for the customer', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const customer = await seedCustomer(tenant._id.toString());
      const appointment = await seedAppointment(tenant._id.toString(), {
        customer: customer._id,
        start: new Date(Date.now() + 60 * 60_000),
        status: 'confirmed',
      });
      const app = buildTestApp();

      const res = await request(app)
        .get(`/appointments/upcoming?customer=${customer._id.toString()}`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(appointment._id.toString());
    });

    it('returns null (not 404) when the customer has no active future appointment', async () => {
      const { cookie } = await seedTenantUser(['operador']);
      const app = buildTestApp();

      const res = await request(app)
        .get(`/appointments/upcoming?customer=${randomId()}`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeNull();
    });

    it('responds 403 for a caller without canOperate', async () => {
      const { cookie } = await seedTenantUser([]);
      const app = buildTestApp();

      const res = await request(app)
        .get(`/appointments/upcoming?customer=${randomId()}`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(403);
    });
  });

  describe('POST /appointments (SCH-30, encaixe do operador)', () => {
    it('creates a pending Appointment even at a time OUTSIDE the professional grid (201)', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const professional = await seedProfessional(tenant._id.toString());
      const customer = await seedCustomer(tenant._id.toString());
      const app = buildTestApp();

      // Grade só cobre segunda 09:00-10:00 — 23:30 de qualquer dia está bem
      // fora dela, provando que o encaixe ignora a grade.
      const res = await request(app).post('/appointments').set('Cookie', cookie).set('User-Agent', DEVICE).send({
        customerId: customer._id.toString(),
        professionalId: professional._id.toString(),
        date: '2026-09-16',
        time: '23:30',
      });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('pending');
      expect(res.body.data.professional).toBe(professional._id.toString());
    });

    it('responds 409 when it overlaps an existing active Appointment of the same professional', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const professional = await seedProfessional(tenant._id.toString());
      const customer = await seedCustomer(tenant._id.toString());
      const app = buildTestApp();
      const body = {
        customerId: customer._id.toString(),
        professionalId: professional._id.toString(),
        date: '2026-09-16',
        time: '23:30',
      };

      const first = await request(app).post('/appointments').set('Cookie', cookie).set('User-Agent', DEVICE).send(body);
      expect(first.status).toBe(201);

      const second = await request(app)
        .post('/appointments')
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ ...body, customerId: (await seedCustomer(tenant._id.toString()))._id.toString() });

      expect(second.status).toBe(409);
    });

    it('responds 403 for a caller without canOperate, creating nothing', async () => {
      const { tenant, cookie } = await seedTenantUser([]);
      const professional = await seedProfessional(tenant._id.toString());
      const customer = await seedCustomer(tenant._id.toString());
      const app = buildTestApp();

      const res = await request(app).post('/appointments').set('Cookie', cookie).set('User-Agent', DEVICE).send({
        customerId: customer._id.toString(),
        professionalId: professional._id.toString(),
        date: '2026-09-16',
        time: '23:30',
      });

      expect(res.status).toBe(403);
      await expect(Appointment.countDocuments({})).resolves.toBe(0);
    });
  });

  describe('POST /appointments/blocks (SCH-33)', () => {
    it('creates a block (201), and a subsequent manual appointment at the exact same start of the same professional fails (409)', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const professional = await seedProfessional(tenant._id.toString());
      const customer = await seedCustomer(tenant._id.toString());
      const app = buildTestApp();

      const blockRes = await request(app)
        .post('/appointments/blocks')
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({
          professionalId: professional._id.toString(),
          startDate: '2026-09-16',
          startTime: '23:30',
          endDate: '2026-09-16',
          endTime: '23:59',
          title: 'Feriado',
        });
      expect(blockRes.status).toBe(201);
      expect(blockRes.body.data.kind).toBe('block');

      const conflictRes = await request(app)
        .post('/appointments')
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({
          customerId: customer._id.toString(),
          professionalId: professional._id.toString(),
          date: '2026-09-16',
          time: '23:30',
        });

      expect(conflictRes.status).toBe(409);
    });

    it('responds 403 for a caller without canOperate, creating nothing', async () => {
      const { tenant, cookie } = await seedTenantUser([]);
      const professional = await seedProfessional(tenant._id.toString());
      const app = buildTestApp();

      const res = await request(app).post('/appointments/blocks').set('Cookie', cookie).set('User-Agent', DEVICE).send({
        professionalId: professional._id.toString(),
        startDate: '2026-09-16',
        startTime: '23:30',
        endDate: '2026-09-16',
        endTime: '23:59',
        title: 'Feriado',
      });

      expect(res.status).toBe(403);
      await expect(Appointment.countDocuments({})).resolves.toBe(0);
    });
  });

  describe('DELETE /appointments/blocks/:id (SCH-33)', () => {
    it('removes the block, freeing the slot for a new manual appointment at the same start', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const professional = await seedProfessional(tenant._id.toString());
      const customer = await seedCustomer(tenant._id.toString());
      const block = await seedBlock(tenant._id.toString(), professional._id.toString());
      const app = buildTestApp();

      const res = await request(app)
        .delete(`/appointments/blocks/${block._id.toString()}`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(200);
      expect(res.body.data.deleted).toBe(true);
      await expect(Appointment.findById(block._id).lean()).resolves.toBeNull();

      const rebooked = await request(app).post('/appointments').set('Cookie', cookie).set('User-Agent', DEVICE).send({
        customerId: customer._id.toString(),
        professionalId: professional._id.toString(),
        date: '2026-01-03',
        time: '09:00',
      });
      expect(rebooked.status).toBe(201);
    });

    it('responds 404 for a block id belonging to a DIFFERENT tenant, without removing it', async () => {
      const owner = await seedTenantUser(['admin']);
      const professional = await seedProfessional(owner.tenant._id.toString());
      const block = await seedBlock(owner.tenant._id.toString(), professional._id.toString());
      const { cookie } = await seedTenantUser(['operador']);
      const app = buildTestApp();

      const res = await request(app)
        .delete(`/appointments/blocks/${block._id.toString()}`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(404);
      await expect(Appointment.findById(block._id).lean()).resolves.not.toBeNull();
    });

    it('responds 403 for a caller without canOperate, removing nothing', async () => {
      const { tenant, cookie } = await seedTenantUser([]);
      const professional = await seedProfessional(tenant._id.toString());
      const block = await seedBlock(tenant._id.toString(), professional._id.toString());
      const app = buildTestApp();

      const res = await request(app)
        .delete(`/appointments/blocks/${block._id.toString()}`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(403);
      await expect(Appointment.findById(block._id).lean()).resolves.not.toBeNull();
    });
  });

  describe('POST /appointments/:id/cancel (SCH-32)', () => {
    it('cancels a pending Appointment -> canceled_by_operator, and the freed slot accepts a new POST / at the same professional+start (201)', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const professional = await seedProfessional(tenant._id.toString());
      const customer = await seedCustomer(tenant._id.toString());
      const app = buildTestApp();
      const body = {
        customerId: customer._id.toString(),
        professionalId: professional._id.toString(),
        date: '2026-09-16',
        time: '23:30',
      };

      const created = await request(app)
        .post('/appointments')
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send(body);
      expect(created.status).toBe(201);

      const canceled = await request(app)
        .post(`/appointments/${created.body.data.id}/cancel`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ reason: 'cliente desmarcou' });

      expect(canceled.status).toBe(200);
      expect(canceled.body.data.status).toBe('canceled_by_operator');

      const rebooked = await request(app)
        .post('/appointments')
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send(body);
      expect(rebooked.status).toBe(201);
    });

    it('responds 409 when canceling an already-terminal Appointment, without changing it', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const professional = await seedProfessional(tenant._id.toString());
      const appointment = await seedAppointment(tenant._id.toString(), {
        professional: professional._id,
        status: 'canceled_by_customer',
      });
      const app = buildTestApp();

      const res = await request(app)
        .post(`/appointments/${appointment._id.toString()}/cancel`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({});

      expect(res.status).toBe(409);
      const reloaded = await Appointment.findById(appointment._id).lean();
      expect(reloaded?.status).toBe('canceled_by_customer');
    });

    it('responds 404 for an Appointment id belonging to a DIFFERENT tenant', async () => {
      const owner = await seedTenantUser(['admin']);
      const appointment = await seedAppointment(owner.tenant._id.toString());
      const { cookie } = await seedTenantUser(['operador']);
      const app = buildTestApp();

      const res = await request(app)
        .post(`/appointments/${appointment._id.toString()}/cancel`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({});

      expect(res.status).toBe(404);
    });

    it('responds 403 for a caller without canOperate, leaving the Appointment untouched', async () => {
      const { tenant, cookie } = await seedTenantUser([]);
      const appointment = await seedAppointment(tenant._id.toString());
      const app = buildTestApp();

      const res = await request(app)
        .post(`/appointments/${appointment._id.toString()}/cancel`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({});

      expect(res.status).toBe(403);
      const reloaded = await Appointment.findById(appointment._id).lean();
      expect(reloaded?.status).toBe('pending');
    });
  });

  describe('POST /appointments/:id/reschedule (SCH-31)', () => {
    it('keeps the SAME id and moves back to pending at the new date/time', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const professional = await seedProfessional(tenant._id.toString());
      const customer = await seedCustomer(tenant._id.toString());
      const app = buildTestApp();

      const created = await request(app).post('/appointments').set('Cookie', cookie).set('User-Agent', DEVICE).send({
        customerId: customer._id.toString(),
        professionalId: professional._id.toString(),
        date: '2026-09-16',
        time: '23:30',
      });
      expect(created.status).toBe(201);

      const rescheduled = await request(app)
        .post(`/appointments/${created.body.data.id}/reschedule`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ date: '2026-09-17', time: '10:00' });

      expect(rescheduled.status).toBe(200);
      expect(rescheduled.body.data.id).toBe(created.body.data.id);
      expect(rescheduled.body.data.status).toBe('pending');
    });

    it('responds 409 when the new slot conflicts with another active Appointment of the same professional', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const professional = await seedProfessional(tenant._id.toString());
      const customer = await seedCustomer(tenant._id.toString());
      const app = buildTestApp();

      const toReschedule = await request(app)
        .post('/appointments')
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({
          customerId: customer._id.toString(),
          professionalId: professional._id.toString(),
          date: '2026-09-16',
          time: '23:30',
        });
      expect(toReschedule.status).toBe(201);

      const occupying = await request(app)
        .post('/appointments')
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({
          customerId: (await seedCustomer(tenant._id.toString()))._id.toString(),
          professionalId: professional._id.toString(),
          date: '2026-09-17',
          time: '10:00',
        });
      expect(occupying.status).toBe(201);

      const res = await request(app)
        .post(`/appointments/${toReschedule.body.data.id}/reschedule`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ date: '2026-09-17', time: '10:00' });

      expect(res.status).toBe(409);
    });

    it('responds 404 for an Appointment id belonging to a DIFFERENT tenant', async () => {
      const owner = await seedTenantUser(['admin']);
      const appointment = await seedAppointment(owner.tenant._id.toString());
      const { cookie } = await seedTenantUser(['operador']);
      const app = buildTestApp();

      const res = await request(app)
        .post(`/appointments/${appointment._id.toString()}/reschedule`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ date: '2026-09-17', time: '10:00' });

      expect(res.status).toBe(404);
    });

    it('responds 403 for a caller without canOperate', async () => {
      const { tenant, cookie } = await seedTenantUser([]);
      const appointment = await seedAppointment(tenant._id.toString());
      const app = buildTestApp();

      const res = await request(app)
        .post(`/appointments/${appointment._id.toString()}/reschedule`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ date: '2026-09-17', time: '10:00' });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /appointments/:id/attendance (SCH-34)', () => {
    it('responds 409 when the Appointment start has not passed yet, leaving it untouched', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const professional = await seedProfessional(tenant._id.toString());
      const customer = await seedCustomer(tenant._id.toString());
      const app = buildTestApp();
      const future = wallClockParts(new Date(Date.now() + 2 * 60 * 60_000));

      const created = await request(app).post('/appointments').set('Cookie', cookie).set('User-Agent', DEVICE).send({
        customerId: customer._id.toString(),
        professionalId: professional._id.toString(),
        date: future.date,
        time: future.time,
      });
      expect(created.status).toBe(201);

      const res = await request(app)
        .post(`/appointments/${created.body.data.id}/attendance`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ status: 'completed' });

      expect(res.status).toBe(409);
      const reloaded = await Appointment.findById(created.body.data.id).lean();
      expect(reloaded?.status).toBe('pending');
    });

    it('marks completed once the start has passed', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const professional = await seedProfessional(tenant._id.toString());
      const customer = await seedCustomer(tenant._id.toString());
      const app = buildTestApp();
      const past = wallClockParts(new Date(Date.now() - 2 * 60 * 60_000));

      const created = await request(app).post('/appointments').set('Cookie', cookie).set('User-Agent', DEVICE).send({
        customerId: customer._id.toString(),
        professionalId: professional._id.toString(),
        date: past.date,
        time: past.time,
      });
      expect(created.status).toBe(201);

      const res = await request(app)
        .post(`/appointments/${created.body.data.id}/attendance`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ status: 'completed' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('completed');
    });

    it('responds 404 for an Appointment id belonging to a DIFFERENT tenant', async () => {
      const owner = await seedTenantUser(['admin']);
      const appointment = await seedAppointment(owner.tenant._id.toString(), {
        start: new Date(Date.now() - 60 * 60_000),
        end: new Date(Date.now() - 30 * 60_000),
      });
      const { cookie } = await seedTenantUser(['operador']);
      const app = buildTestApp();

      const res = await request(app)
        .post(`/appointments/${appointment._id.toString()}/attendance`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ status: 'completed' });

      expect(res.status).toBe(404);
    });

    it('responds 403 for a caller without canOperate', async () => {
      const { tenant, cookie } = await seedTenantUser([]);
      const appointment = await seedAppointment(tenant._id.toString(), {
        start: new Date(Date.now() - 60 * 60_000),
        end: new Date(Date.now() - 30 * 60_000),
      });
      const app = buildTestApp();

      const res = await request(app)
        .post(`/appointments/${appointment._id.toString()}/attendance`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ status: 'completed' });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /appointments/:id/confirmation-link (SCH-24, SCH-37)', () => {
    it('returns a wa.me link containing a fresh apt_ token, and the OLD token stops resolving to any Appointment (SCH-24)', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const professional = await seedProfessional(tenant._id.toString());
      const customer = await seedCustomer(tenant._id.toString());
      const oldToken = 'apt_old-token-before-reissue';
      const appointment = await seedAppointment(tenant._id.toString(), {
        professional: professional._id,
        customer: customer._id,
        confirmationTokenHash: hashToken(oldToken),
        confirmationExpiresAt: new Date(Date.now() + 60 * 60_000),
      });
      const app = buildTestApp();

      const res = await request(app)
        .post(`/appointments/${appointment._id.toString()}/confirmation-link`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(200);
      expect(res.body.data.waMeUrl).toMatch(/^https:\/\/wa\.me\//);
      expect(res.body.data.waMeUrl).toContain(encodeURIComponent('token=apt_'));
      expect(res.body.data.confirmationUrl).toMatch(/\/appointment\?token=apt_/);
      expect(res.body.data.confirmationUrl).not.toContain(oldToken);

      // SCH-24: reemitir invalida o token anterior — checado diretamente no
      // modelo (mais simples que subir o router público de T22 no mesmo app
      // de teste, per T25 Done-when).
      const foundByOldHash = await Appointment.findOne({ confirmationTokenHash: hashToken(oldToken) }).lean();
      expect(foundByOldHash).toBeNull();
    });

    it('responds 404 for an Appointment id belonging to a DIFFERENT tenant', async () => {
      const owner = await seedTenantUser(['admin']);
      const appointment = await seedAppointment(owner.tenant._id.toString());
      const { cookie } = await seedTenantUser(['operador']);
      const app = buildTestApp();

      const res = await request(app)
        .post(`/appointments/${appointment._id.toString()}/confirmation-link`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(404);
    });

    it('responds 403 for a caller without canOperate', async () => {
      const { tenant, cookie } = await seedTenantUser([]);
      const appointment = await seedAppointment(tenant._id.toString());
      const app = buildTestApp();

      const res = await request(app)
        .post(`/appointments/${appointment._id.toString()}/confirmation-link`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(403);
    });
  });
});
