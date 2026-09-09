import crypto, { createHash } from 'node:crypto';
import { AsaasEvent, AsaasIntegration, connect, disconnect, Payment } from '@crm/db';
import express, { type Express } from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Mesmo idioma de runTurn.int.test.ts (packages/ai-kit): vi.spyOn direto no
// namespace de um módulo ESM lança "Module namespace is not configurable"
// neste projeto — o mock com `importOriginal` delega para a implementação
// REAL (paymentTransitions.ts, já testado na Fase 1), só envolvendo-a num
// spy pra provar QUANTAS vezes o router realmente a chamou (PAY-07: a 2ª
// entrega do mesmo evento nunca deveria reprocessar).
const applyAsaasPaymentStatusSpy = vi.fn();
vi.mock('@crm/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@crm/db')>();
  return {
    ...actual,
    applyAsaasPaymentStatus: (...args: Parameters<typeof actual.applyAsaasPaymentStatus>) => {
      applyAsaasPaymentStatusSpy(...args);
      return actual.applyAsaasPaymentStatus(...args);
    },
  };
});

import { createAsaasWebhookRouter } from './asaasWebhook.router.js';

const randomId = (): string => crypto.randomBytes(12).toString('hex');
const AUTH_TOKEN = 'asaas-auth-token-teste';
const AUTH_TOKEN_HASH = createHash('sha256').update(AUTH_TOKEN).digest('hex');

const buildTestApp = (): Express => {
  const app = express();
  app.use('/webhooks/asaas', createAsaasWebhookRouter());
  return app;
};

const seedIntegration = async (tenant: string, webhookToken: string) =>
  AsaasIntegration.create({
    Tenant: tenant,
    apiKeyEnc: { ciphertext: 'c', iv: 'i', authTag: 'a' },
    environment: 'sandbox',
    webhookToken,
    webhookAuthTokenHash: AUTH_TOKEN_HASH,
    status: 'active',
  });

const seedPayment = async (tenant: string, asaasChargeId: string, overrides: Record<string, unknown> = {}) =>
  Payment.create({
    Tenant: tenant,
    order: randomId(),
    asaasChargeId,
    asaasCustomerId: 'cus_teste',
    billingType: 'PIX' as const,
    value: 5000,
    status: 'pending',
    asaasStatus: 'PENDING',
    ...overrides,
  });

const webhookBody = (overrides: {
  id?: string;
  event?: string;
  payment?: { id?: string; status?: string };
}): Record<string, unknown> => ({
  id: `evt_${randomId()}`,
  event: 'PAYMENT_CONFIRMED',
  payment: { id: 'ch_default', status: 'CONFIRMED' },
  ...overrides,
});

describe('asaasWebhook.router (PAY-06/07/08/09)', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
    await AsaasIntegration.init();
    await AsaasEvent.init();
    await Payment.init();
  });

  afterEach(async () => {
    await Promise.all([AsaasIntegration.deleteMany({}), AsaasEvent.deleteMany({}), Payment.deleteMany({})]);
    applyAsaasPaymentStatusSpy.mockClear();
  });

  afterAll(async () => {
    await disconnect();
  });

  it('a valid webhook (new event, known token, matching header) responds 200, updates Payment.status and records the AsaasEvent as processed', async () => {
    const tenant = randomId();
    const webhookToken = randomId();
    await seedIntegration(tenant, webhookToken);
    const payment = await seedPayment(tenant, 'ch_valid');
    const app = buildTestApp();
    const body = webhookBody({ payment: { id: 'ch_valid', status: 'CONFIRMED' } });

    const res = await request(app)
      .post(`/webhooks/asaas/${webhookToken}`)
      .set('asaas-access-token', AUTH_TOKEN)
      .send(body);

    expect(res.status).toBe(200);
    const updatedPayment = await Payment.findById(payment._id).lean();
    expect(updatedPayment?.status).toBe('paid');
    const event = await AsaasEvent.findOne({ asaasEventId: body.id as string }).lean();
    expect(event?.status).toBe('processed');
  });

  it('responds 401 for an unknown webhookToken/invalid header and touches no AsaasEvent (via T21 middleware)', async () => {
    const tenant = randomId();
    const webhookToken = randomId();
    await seedIntegration(tenant, webhookToken);
    const app = buildTestApp();

    const res = await request(app)
      .post(`/webhooks/asaas/${webhookToken}`)
      .set('asaas-access-token', 'token-errado')
      .send(webhookBody({}));

    expect(res.status).toBe(401);
    expect(await AsaasEvent.countDocuments({})).toBe(0);
  });

  it('the same asaasEventId delivered twice is processed exactly once (PAY-07) — the 2nd call never re-invokes applyAsaasPaymentStatus, still 200', async () => {
    const tenant = randomId();
    const webhookToken = randomId();
    await seedIntegration(tenant, webhookToken);
    await seedPayment(tenant, 'ch_dup');
    const app = buildTestApp();
    const body = webhookBody({ id: 'evt_dup_1', payment: { id: 'ch_dup', status: 'CONFIRMED' } });

    const first = await request(app)
      .post(`/webhooks/asaas/${webhookToken}`)
      .set('asaas-access-token', AUTH_TOKEN)
      .send(body);
    const second = await request(app)
      .post(`/webhooks/asaas/${webhookToken}`)
      .set('asaas-access-token', AUTH_TOKEN)
      .send(body);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(applyAsaasPaymentStatusSpy).toHaveBeenCalledTimes(1);
    expect(await AsaasEvent.countDocuments({ asaasEventId: 'evt_dup_1' })).toBe(1);
  });

  it('a stale lower-rank status delivered after a higher-rank one (two DIFFERENT AsaasEvent ids, same Payment) never downgrades the stored status, still 200 both times (PAY-08)', async () => {
    const tenant = randomId();
    const webhookToken = randomId();
    await seedIntegration(tenant, webhookToken);
    const payment = await seedPayment(tenant, 'ch_rank');
    const app = buildTestApp();
    const confirmedBody = webhookBody({ id: 'evt_rank_confirmed', payment: { id: 'ch_rank', status: 'CONFIRMED' } });
    const stalePendingBody = webhookBody({ id: 'evt_rank_pending', payment: { id: 'ch_rank', status: 'PENDING' } });

    const first = await request(app)
      .post(`/webhooks/asaas/${webhookToken}`)
      .set('asaas-access-token', AUTH_TOKEN)
      .send(confirmedBody);
    const second = await request(app)
      .post(`/webhooks/asaas/${webhookToken}`)
      .set('asaas-access-token', AUTH_TOKEN)
      .send(stalePendingBody);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const updatedPayment = await Payment.findById(payment._id).lean();
    expect(updatedPayment?.status).toBe('paid');
    expect(applyAsaasPaymentStatusSpy).toHaveBeenCalledTimes(2);
  });

  it('a malformed payload (no stable id, no resolvable payment.id) still gets a synthesized dedup key, responds 200, and is recorded failed without crashing (spec.md Edge Cases)', async () => {
    const tenant = randomId();
    const webhookToken = randomId();
    await seedIntegration(tenant, webhookToken);
    const app = buildTestApp();

    const res = await request(app)
      .post(`/webhooks/asaas/${webhookToken}`)
      .set('asaas-access-token', AUTH_TOKEN)
      .send({ event: 'PAYMENT_CREATED_SEM_ID' });

    expect(res.status).toBe(200);
    const event = await AsaasEvent.findOne({ event: 'PAYMENT_CREATED_SEM_ID' }).lean();
    expect(event?.asaasEventId).toBe('PAYMENT_CREATED_SEM_ID:unknown:unknown');
    expect(event?.status).toBe('failed');
    expect(event?.error).toEqual(expect.any(String));
  });
});
