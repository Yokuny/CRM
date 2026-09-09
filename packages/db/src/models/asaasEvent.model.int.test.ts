import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../tests/helpers/db.helper.js';
import { AsaasEvent } from './asaasEvent.model.js';

const baseEvent = (Tenant: mongoose.Types.ObjectId, overrides: Partial<Record<string, unknown>> = {}) => ({
  Tenant,
  asaasEventId: `evt_${new mongoose.Types.ObjectId().toString()}`,
  event: 'PAYMENT_CONFIRMED',
  payload: { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_000000000001', status: 'CONFIRMED' } },
  receivedAt: new Date(),
  ...overrides,
});

describe('AsaasEvent model', () => {
  useTestDb();

  // spec.md P1 "Webhook + rede de segurança"/AC3: mesmo evento entregue mais
  // de uma vez é processado exatamente uma vez (dedup) — o índice único é o
  // backstop de dado dessa invariante.
  it('rejects a second AsaasEvent with the same asaasEventId (unique index)', async () => {
    await AsaasEvent.init();
    const sharedId = 'evt_shared_id';
    await AsaasEvent.create(baseEvent(new mongoose.Types.ObjectId(), { asaasEventId: sharedId }));

    await expect(
      AsaasEvent.create(baseEvent(new mongoose.Types.ObjectId(), { asaasEventId: sharedId })),
    ).rejects.toThrow();
  });

  it('declares the {asaasEventId} unique index', async () => {
    await AsaasEvent.init();

    const indexes = await AsaasEvent.collection.indexes();
    const uniqueKeys = indexes.filter((index) => index.unique).map((index) => JSON.stringify(index.key));

    expect(uniqueKeys).toContain(JSON.stringify({ asaasEventId: 1 }));
  });

  it('defaults status to received and attempts to 0', async () => {
    const created = await AsaasEvent.create(baseEvent(new mongoose.Types.ObjectId()));

    expect(created.status).toBe('received');
    expect(created.attempts).toBe(0);
  });

  // design.md: `payload: unknown` (Mixed) — nunca parseado estritamente,
  // payloads do Asaas evoluem (spec.md Edge Cases).
  it('persists and reloads an arbitrary Mixed payload without dropping unrecognized fields', async () => {
    const Tenant = new mongoose.Types.ObjectId();
    const rawPayload = {
      event: 'PAYMENT_RECEIVED',
      dateCreated: '2026-09-09T12:00:00Z',
      payment: { id: 'pay_x', status: 'RECEIVED', aFutureFieldNotYetKnown: true },
    };
    const created = await AsaasEvent.create(baseEvent(Tenant, { payload: rawPayload }));

    const reloaded = await AsaasEvent.findById(created._id).lean();

    expect(reloaded?.payload).toEqual(rawPayload);
  });

  // design.md: `status: 'received' | 'processed' | 'failed'` — enum fechado.
  it('rejects a status outside received|processed|failed', async () => {
    await expect(
      AsaasEvent.create(baseEvent(new mongoose.Types.ObjectId(), { status: 'pending' })),
    ).rejects.toThrow();
  });

  it('persists optional error/processedAt when provided, and omits them when absent', async () => {
    const processedAt = new Date('2026-09-09T13:00:00.000Z');
    const withOptionals = await AsaasEvent.create(
      baseEvent(new mongoose.Types.ObjectId(), { status: 'failed', error: 'timeout', processedAt }),
    );
    const withoutOptionals = await AsaasEvent.create(baseEvent(new mongoose.Types.ObjectId()));

    expect(withOptionals.error).toBe('timeout');
    expect(withOptionals.processedAt).toEqual(processedAt);
    expect(withoutOptionals.error).toBeUndefined();
    expect(withoutOptionals.processedAt).toBeUndefined();
  });

  it('persists the required receivedAt as a Date', async () => {
    const receivedAt = new Date('2026-09-09T10:00:00.000Z');
    const created = await AsaasEvent.create(baseEvent(new mongoose.Types.ObjectId(), { receivedAt }));

    expect(created.receivedAt).toEqual(receivedAt);
  });
});
