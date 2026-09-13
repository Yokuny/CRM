import crypto from 'node:crypto';
import { Appointment, Customer, connect, disconnect, hashToken, Professional, Space } from '@crm/db';
import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { errorHandler } from '../middlewares/errorHandler.middleware.js';
import { appointmentConfirmationRouter } from './appointmentConfirmation.router.js';

// Sem `mongoose` aqui (AD-010/boundary estrutural: só packages/db importa
// mongoose) — mesmo padrão de invite.router.e2e.test.ts.
const randomId = (): string => crypto.randomBytes(12).toString('hex');

// `trust proxy` habilita `req.ip` a ler `X-Forwarded-For` — necessário para
// isolar `appointmentConfirmationRateLimit` (chave só por IP, SCH-27) entre
// os casos deste arquivo: sem tenant nem e-mail para variar a chave (ao
// contrário de customerRateLimit/fieldTemplateRateLimit, que isolam por
// tenant), cada teste usa seu próprio IP forjado, mesmo papel que "cada
// teste recebe seu próprio Tenant" cumpre nos outros arquivos de rate limit.
const buildTestApp = () => {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json());
  app.use('/appointment-confirmations', appointmentConfirmationRouter);
  app.use(errorHandler);
  return app;
};

let ipSeq = 0;
const nextIp = (): string => {
  ipSeq += 1;
  return `10.0.0.${ipSeq}`;
};

const future = (minutes = 30) => new Date(Date.now() + minutes * 60_000);
const past = (minutes = 30) => new Date(Date.now() - minutes * 60_000);

const seedAppointment = async (token: string, overrides: Partial<Record<string, unknown>> = {}) => {
  const tenantId = randomId();
  const professional = await Professional.create({
    Tenant: tenantId,
    name: 'Dra. Ana',
    slotDurationMinutes: 30,
    weeklySchedule: [{ weekday: 1, start: '09:00', end: '12:00' }],
  });
  const space = await Space.create({ Tenant: tenantId, name: 'Sala 1' });
  const customer = await Customer.create({
    Tenant: tenantId,
    name: 'Cliente Teste',
    phone: '11900000000',
    template: randomId(),
    templateVersion: 1,
    values: {},
  });
  return Appointment.create({
    Tenant: tenantId,
    kind: 'appointment',
    professional: professional._id,
    space: space._id,
    customer: customer._id,
    start: future(60),
    end: future(90),
    status: 'pending',
    source: 'ai',
    confirmationTokenHash: hashToken(token),
    confirmationExpiresAt: future(90),
    ...overrides,
  });
};

describe('appointment confirmation routes (public, SCH-22..27)', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
  });

  afterEach(async () => {
    await Promise.all([
      Appointment.deleteMany({}),
      Professional.deleteMany({}),
      Space.deleteMany({}),
      Customer.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await disconnect();
  });

  describe('GET /appointment-confirmations/:token', () => {
    it('returns only date, time, professionalName, spaceName, customerName and status — no internal id, no token/hash', async () => {
      const token = 'token-valido-1';
      await seedAppointment(token);

      const res = await request(buildTestApp())
        .get(`/appointment-confirmations/${token}`)
        .set('X-Forwarded-For', nextIp());

      expect(res.status).toBe(200);
      expect(Object.keys(res.body.data).sort()).toEqual(
        ['customerName', 'date', 'professionalName', 'spaceName', 'status', 'time'].sort(),
      );
      expect(res.body.data.professionalName).toBe('Dra. Ana');
      expect(res.body.data.spaceName).toBe('Sala 1');
      expect(res.body.data.customerName).toBe('Cliente Teste');
      expect(res.body.data.status).toBe('pending');
      const raw = JSON.stringify(res.body);
      expect(raw).not.toContain(token);
      expect(raw).not.toContain(hashToken(token));
      // Nenhum valor com formato de ObjectId de 24 hex (spec.md Edge Cases).
      for (const value of Object.values(res.body.data)) {
        if (typeof value === 'string') expect(value).not.toMatch(/^[0-9a-f]{24}$/i);
      }
    });

    it('a token belonging to a DIFFERENT appointment never resolves to another appointment (SCH-22)', async () => {
      const tokenA = 'token-a';
      const tokenB = 'token-b';
      await seedAppointment(tokenA, { status: 'pending' });
      await seedAppointment(tokenB, { status: 'confirmed' });
      const app = buildTestApp();
      const ip = nextIp();

      const resA = await request(app).get(`/appointment-confirmations/${tokenA}`).set('X-Forwarded-For', ip);
      const resB = await request(app).get(`/appointment-confirmations/${tokenB}`).set('X-Forwarded-For', ip);

      expect(resA.body.data.status).toBe('pending');
      expect(resB.body.data.status).toBe('confirmed');
    });

    it('responds 404 for a token that does not exist', async () => {
      const res = await request(buildTestApp())
        .get('/appointment-confirmations/token-que-nunca-existiu')
        .set('X-Forwarded-For', nextIp());

      expect(res.status).toBe(404);
    });

    it('responds 410 for an expired token', async () => {
      const token = 'token-expirado';
      await seedAppointment(token, { confirmationExpiresAt: past() });

      const res = await request(buildTestApp())
        .get(`/appointment-confirmations/${token}`)
        .set('X-Forwarded-For', nextIp());

      expect(res.status).toBe(410);
    });
  });

  describe('POST /appointment-confirmations/:token/confirm (SCH-25)', () => {
    it('confirms a pending Appointment -> confirmed', async () => {
      const token = 'confirmar-1';
      await seedAppointment(token, { status: 'pending' });

      const res = await request(buildTestApp())
        .post(`/appointment-confirmations/${token}/confirm`)
        .set('X-Forwarded-For', nextIp());

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('confirmed');
    });

    it('repeating the same confirm on an already-confirmed Appointment responds 200 with the same state (idempotent)', async () => {
      const token = 'confirmar-2';
      await seedAppointment(token, { status: 'pending' });
      const app = buildTestApp();
      const ip = nextIp();

      const first = await request(app).post(`/appointment-confirmations/${token}/confirm`).set('X-Forwarded-For', ip);
      const second = await request(app).post(`/appointment-confirmations/${token}/confirm`).set('X-Forwarded-For', ip);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(second.body.data.status).toBe('confirmed');
    });

    it('responds 409 for a terminal Appointment, without changing it', async () => {
      const token = 'confirmar-terminal';
      await seedAppointment(token, { status: 'canceled_by_operator' });

      const res = await request(buildTestApp())
        .post(`/appointment-confirmations/${token}/confirm`)
        .set('X-Forwarded-For', nextIp());

      expect(res.status).toBe(409);
      const reloaded = await Appointment.findOne({ confirmationTokenHash: hashToken(token) }).lean();
      expect(reloaded?.status).toBe('canceled_by_operator');
    });

    it('responds 410 for an expired token', async () => {
      const token = 'confirmar-expirado';
      await seedAppointment(token, { confirmationExpiresAt: past() });

      const res = await request(buildTestApp())
        .post(`/appointment-confirmations/${token}/confirm`)
        .set('X-Forwarded-For', nextIp());

      expect(res.status).toBe(410);
    });

    it('responds 404 for a token that does not exist', async () => {
      const res = await request(buildTestApp())
        .post('/appointment-confirmations/nunca-existiu/confirm')
        .set('X-Forwarded-For', nextIp());

      expect(res.status).toBe(404);
    });
  });

  describe('POST /appointment-confirmations/:token/cancel (SCH-26)', () => {
    it('cancels a pending Appointment -> canceled_by_customer', async () => {
      const token = 'cancelar-1';
      await seedAppointment(token, { status: 'pending' });

      const res = await request(buildTestApp())
        .post(`/appointment-confirmations/${token}/cancel`)
        .set('X-Forwarded-For', nextIp());

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('canceled_by_customer');
    });

    it('responds 409 for a terminal Appointment', async () => {
      const token = 'cancelar-terminal';
      await seedAppointment(token, { status: 'completed' });

      const res = await request(buildTestApp())
        .post(`/appointment-confirmations/${token}/cancel`)
        .set('X-Forwarded-For', nextIp());

      expect(res.status).toBe(409);
    });
  });

  describe('rate limit (spec.md Assumptions, SCH-27)', () => {
    it('responds 429 after exceeding the limit (5 per window) for the same IP', async () => {
      const app = buildTestApp();
      const ip = nextIp();

      let last: { status: number } | undefined;
      for (let i = 0; i < 6; i += 1) {
        last = await request(app).get('/appointment-confirmations/qualquer-token').set('X-Forwarded-For', ip);
      }

      expect(last?.status).toBe(429);
    });

    it('a DIFFERENT IP is unaffected by another IP having exhausted its quota', async () => {
      const app = buildTestApp();
      const exhaustedIp = nextIp();
      for (let i = 0; i < 5; i += 1) {
        await request(app).get('/appointment-confirmations/qualquer-token').set('X-Forwarded-For', exhaustedIp);
      }
      const exhaustedRes = await request(app)
        .get('/appointment-confirmations/qualquer-token')
        .set('X-Forwarded-For', exhaustedIp);
      expect(exhaustedRes.status).toBe(429);

      const freshRes = await request(app)
        .get('/appointment-confirmations/qualquer-token')
        .set('X-Forwarded-For', nextIp());
      expect(freshRes.status).toBe(404);
    });
  });

  describe('no route in this router ever accepts an appointment id as a route param', () => {
    it('the router source never declares an `:id` param', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const here = path.dirname(fileURLToPath(import.meta.url));
      const source = fs.readFileSync(path.join(here, 'appointmentConfirmation.router.ts'), 'utf-8');

      expect(source).not.toMatch(/:id\b/);
    });
  });
});
