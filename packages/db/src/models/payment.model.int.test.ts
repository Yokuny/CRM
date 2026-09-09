import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../tests/helpers/db.helper.js';
import { Payment } from './payment.model.js';

const basePayment = (
  Tenant: mongoose.Types.ObjectId,
  order: mongoose.Types.ObjectId,
  overrides: Partial<Record<string, unknown>> = {},
) => ({
  Tenant,
  order,
  asaasChargeId: `pay_${new mongoose.Types.ObjectId().toString()}`,
  asaasCustomerId: 'cus_000000000001',
  billingType: 'PIX',
  value: 10000,
  asaasStatus: 'PENDING',
  ...overrides,
});

describe('Payment model', () => {
  useTestDb();

  // design.md Data Models: `order` unique — no máximo um Payment por Order
  // (P1 scope, spec.md AC3 "issue_payment_link idempotente").
  it('rejects a second Payment for the same order (unique index)', async () => {
    await Payment.init();
    const Tenant = new mongoose.Types.ObjectId();
    const order = new mongoose.Types.ObjectId();
    await Payment.create(basePayment(Tenant, order));

    await expect(Payment.create(basePayment(Tenant, order))).rejects.toThrow();
  });

  it('rejects a second Payment with the same asaasChargeId (unique index)', async () => {
    await Payment.init();
    const Tenant = new mongoose.Types.ObjectId();
    const chargeId = 'pay_shared_charge';
    await Payment.create(basePayment(Tenant, new mongoose.Types.ObjectId(), { asaasChargeId: chargeId }));

    await expect(
      Payment.create(basePayment(Tenant, new mongoose.Types.ObjectId(), { asaasChargeId: chargeId })),
    ).rejects.toThrow();
  });

  it('declares the {order} and {asaasChargeId} unique indexes', async () => {
    await Payment.init();

    const indexes = await Payment.collection.indexes();
    const uniqueKeys = indexes.filter((index) => index.unique).map((index) => JSON.stringify(index.key));

    expect(uniqueKeys).toContain(JSON.stringify({ order: 1 }));
    expect(uniqueKeys).toContain(JSON.stringify({ asaasChargeId: 1 }));
  });

  it('defaults status to pending and stamps createdAt/updatedAt', async () => {
    const created = await Payment.create(basePayment(new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()));

    expect(created.status).toBe('pending');
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(created.updatedAt).toBeInstanceOf(Date);
  });

  // design.md: `value: number; // int cents` — snapshot de Order.totalPrice.
  it('rejects a non-integer value', async () => {
    await expect(
      Payment.create(basePayment(new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId(), { value: 100.5 })),
    ).rejects.toThrow();
  });

  // design.md: `billingType: 'PIX'` — literal para P1, não um enum aberto.
  it('rejects a billingType other than PIX', async () => {
    await expect(
      Payment.create(
        basePayment(new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId(), { billingType: 'BOLETO' }),
      ),
    ).rejects.toThrow();
  });

  // design.md: `status: 'pending' | 'paid' | 'expired' | 'refunded' | 'canceled'`
  // — enum fechado, não uma string livre.
  it('rejects a status outside the pending|paid|expired|refunded|canceled enum', async () => {
    await expect(
      Payment.create(
        basePayment(new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId(), { status: 'processing' }),
      ),
    ).rejects.toThrow();
  });

  it('persists and reloads the optional PIX fields (pixPayload/pixEncodedImage/pixExpirationDate)', async () => {
    const expirationDate = new Date('2026-10-01T00:00:00.000Z');
    const created = await Payment.create(
      basePayment(new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId(), {
        pixPayload: '00020126...copia-e-cola',
        pixEncodedImage: 'base64-qr-code',
        pixExpirationDate: expirationDate,
      }),
    );

    const reloaded = await Payment.findById(created._id).lean();

    expect(reloaded?.pixPayload).toBe('00020126...copia-e-cola');
    expect(reloaded?.pixEncodedImage).toBe('base64-qr-code');
    expect(reloaded?.pixExpirationDate).toEqual(expirationDate);
  });

  it('omits the optional PIX fields when not provided', async () => {
    const created = await Payment.create(basePayment(new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()));

    expect(created.pixPayload).toBeUndefined();
    expect(created.pixEncodedImage).toBeUndefined();
    expect(created.pixExpirationDate).toBeUndefined();
  });
});
