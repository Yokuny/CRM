import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../tests/helpers/db.helper.js';
import type { OrderItem } from './models/order.model.js';
import { Order } from './models/order.model.js';
import type { PaymentDocument } from './models/payment.model.js';
import { Payment } from './models/payment.model.js';
import { Product } from './models/product.model.js';
import { applyAsaasPaymentStatus, expireOrderPayment } from './paymentTransitions.js';

const seedProduct = (Tenant: mongoose.Types.ObjectId, overrides: Partial<Record<string, unknown>> = {}) =>
  Product.create({ Tenant, name: 'Produto Teste', price: 1000, stock: 5, active: true, ...overrides });

const seedOrder = (
  Tenant: mongoose.Types.ObjectId,
  items: OrderItem[],
  overrides: Partial<Record<string, unknown>> = {},
) =>
  Order.create({
    Tenant,
    conversation: new mongoose.Types.ObjectId(),
    customer: new mongoose.Types.ObjectId(),
    items,
    totalPrice: items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    status: 'confirmed',
    idempotencyKey: `key-${new mongoose.Types.ObjectId().toString()}`,
    customerConfirmed: true,
    operatorApproved: true,
    ...overrides,
  });

const seedPayment = (
  Tenant: mongoose.Types.ObjectId,
  order: mongoose.Types.ObjectId,
  overrides: Partial<Record<string, unknown>> = {},
) =>
  Payment.create({
    Tenant,
    order,
    asaasChargeId: `pay_${new mongoose.Types.ObjectId().toString()}`,
    asaasCustomerId: 'cus_000000000001',
    billingType: 'PIX' as const,
    value: 1000,
    asaasStatus: 'PENDING',
    status: 'pending',
    ...overrides,
  });

const isError = (result: unknown): result is { error: string } =>
  typeof result === 'object' && result !== null && 'error' in result;

describe('paymentTransitions', () => {
  useTestDb();

  describe('applyAsaasPaymentStatus — maps asaasStatus to the domain enum (spec.md P1 "Webhook + rede de segurança"/AC1, PAY-08)', () => {
    it.each([
      ['PENDING', 'pending'],
      ['OVERDUE', 'pending'],
      ['RECEIVED', 'paid'],
      ['CONFIRMED', 'paid'],
      ['REFUNDED', 'refunded'],
      ['REFUND_REQUESTED', 'refunded'],
      ['REFUND_IN_PROGRESS', 'refunded'],
      ['CHARGEBACK_REQUESTED', 'canceled'],
      ['CHARGEBACK_DISPUTE', 'canceled'],
      ['AWAITING_CHARGEBACK_REVERSAL', 'canceled'],
      // spec.md Edge Cases: um status do Asaas não reconhecido nunca lança —
      // cai no rank mais baixo (pending), nunca derruba nada.
      ['SOME_FUTURE_STATUS_NOT_YET_KNOWN', 'pending'],
    ])('maps asaasStatus %s to domain status %s on a pending Payment', async (asaasStatus, expectedStatus) => {
      const Tenant = new mongoose.Types.ObjectId();
      const product = await seedProduct(Tenant);
      const order = await seedOrder(Tenant, [
        { product: product._id, name: 'Produto Teste', unitPrice: 1000, quantity: 1 },
      ]);
      const payment = await seedPayment(Tenant, order._id);

      const result = await applyAsaasPaymentStatus(Tenant.toString(), payment._id.toString(), asaasStatus, {
        event: asaasStatus,
      });

      expect(isError(result)).toBe(false);
      const updated = result as PaymentDocument;
      expect(updated.status).toBe(expectedStatus);
      expect(updated.asaasStatus).toBe(asaasStatus);
    });

    it('returns {error} for a non-existent paymentId', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const result = await applyAsaasPaymentStatus(
        Tenant.toString(),
        new mongoose.Types.ObjectId().toString(),
        'CONFIRMED',
        {},
      );

      expect(isError(result)).toBe(true);
    });

    it('returns {error} for a Payment belonging to a DIFFERENT tenant, leaving it untouched', async () => {
      const ownerTenant = new mongoose.Types.ObjectId();
      const intruderTenant = new mongoose.Types.ObjectId();
      const product = await seedProduct(ownerTenant);
      const order = await seedOrder(ownerTenant, [
        { product: product._id, name: 'Produto Teste', unitPrice: 1000, quantity: 1 },
      ]);
      const payment = await seedPayment(ownerTenant, order._id);

      const result = await applyAsaasPaymentStatus(intruderTenant.toString(), payment._id.toString(), 'CONFIRMED', {});

      expect(isError(result)).toBe(true);
      const reloaded = await Payment.findById(payment._id).lean();
      expect(reloaded?.status).toBe('pending');
    });
  });

  describe('applyAsaasPaymentStatus — rank guard never downgrades (spec.md P1 "Webhook + rede de segurança"/AC4, PAY-08)', () => {
    it('keeps status paid when a stale PENDING arrives after CONFIRMED was already processed', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const product = await seedProduct(Tenant);
      const order = await seedOrder(Tenant, [
        { product: product._id, name: 'Produto Teste', unitPrice: 1000, quantity: 1 },
      ]);
      const payment = await seedPayment(Tenant, order._id);

      const afterConfirmed = await applyAsaasPaymentStatus(Tenant.toString(), payment._id.toString(), 'CONFIRMED', {});
      expect((afterConfirmed as PaymentDocument).status).toBe('paid');

      const afterStalePending = await applyAsaasPaymentStatus(Tenant.toString(), payment._id.toString(), 'PENDING', {});

      expect(isError(afterStalePending)).toBe(false);
      expect((afterStalePending as PaymentDocument).status).toBe('paid');
      // O downgrade é rejeitado por completo — nem o asaasStatus bruto é
      // sobrescrito pelo evento tardio (estado real do banco, não só o
      // valor de retorno).
      const reloaded = await Payment.findById(payment._id).lean();
      expect(reloaded?.status).toBe('paid');
      expect(reloaded?.asaasStatus).toBe('CONFIRMED');
    });

    it('keeps status paid when a stale OVERDUE arrives after RECEIVED was already processed', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const product = await seedProduct(Tenant);
      const order = await seedOrder(Tenant, [
        { product: product._id, name: 'Produto Teste', unitPrice: 1000, quantity: 1 },
      ]);
      const payment = await seedPayment(Tenant, order._id);
      await applyAsaasPaymentStatus(Tenant.toString(), payment._id.toString(), 'RECEIVED', {});

      const result = await applyAsaasPaymentStatus(Tenant.toString(), payment._id.toString(), 'OVERDUE', {});

      expect((result as PaymentDocument).status).toBe('paid');
    });

    it('allows a paid Payment to progress to refunded (forward transition, not a downgrade)', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const product = await seedProduct(Tenant);
      const order = await seedOrder(Tenant, [
        { product: product._id, name: 'Produto Teste', unitPrice: 1000, quantity: 1 },
      ]);
      const payment = await seedPayment(Tenant, order._id);
      await applyAsaasPaymentStatus(Tenant.toString(), payment._id.toString(), 'CONFIRMED', {});

      const result = await applyAsaasPaymentStatus(Tenant.toString(), payment._id.toString(), 'REFUNDED', {});

      expect(isError(result)).toBe(false);
      expect((result as PaymentDocument).status).toBe('refunded');
    });

    it('allows a paid Payment to progress to canceled via chargeback (forward transition, not a downgrade)', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const product = await seedProduct(Tenant);
      const order = await seedOrder(Tenant, [
        { product: product._id, name: 'Produto Teste', unitPrice: 1000, quantity: 1 },
      ]);
      const payment = await seedPayment(Tenant, order._id);
      await applyAsaasPaymentStatus(Tenant.toString(), payment._id.toString(), 'CONFIRMED', {});

      const result = await applyAsaasPaymentStatus(
        Tenant.toString(),
        payment._id.toString(),
        'CHARGEBACK_REQUESTED',
        {},
      );

      expect(isError(result)).toBe(false);
      expect((result as PaymentDocument).status).toBe('canceled');
    });

    it('never overwrites a refunded (terminal) Payment with a stale CONFIRMED event', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const product = await seedProduct(Tenant);
      const order = await seedOrder(Tenant, [
        { product: product._id, name: 'Produto Teste', unitPrice: 1000, quantity: 1 },
      ]);
      const payment = await seedPayment(Tenant, order._id);
      await applyAsaasPaymentStatus(Tenant.toString(), payment._id.toString(), 'REFUNDED', {});

      const result = await applyAsaasPaymentStatus(Tenant.toString(), payment._id.toString(), 'CONFIRMED', {});

      expect((result as PaymentDocument).status).toBe('refunded');
    });

    it('never overwrites a canceled (terminal) Payment with a stale RECEIVED event', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const product = await seedProduct(Tenant);
      const order = await seedOrder(Tenant, [
        { product: product._id, name: 'Produto Teste', unitPrice: 1000, quantity: 1 },
      ]);
      const payment = await seedPayment(Tenant, order._id);
      await applyAsaasPaymentStatus(Tenant.toString(), payment._id.toString(), 'CHARGEBACK_REQUESTED', {});

      const result = await applyAsaasPaymentStatus(Tenant.toString(), payment._id.toString(), 'RECEIVED', {});

      expect((result as PaymentDocument).status).toBe('canceled');
    });

    it('never overwrites a refunded Payment with a same-rank chargeback event (lateral move between terminals)', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const product = await seedProduct(Tenant);
      const order = await seedOrder(Tenant, [
        { product: product._id, name: 'Produto Teste', unitPrice: 1000, quantity: 1 },
      ]);
      const payment = await seedPayment(Tenant, order._id);
      await applyAsaasPaymentStatus(Tenant.toString(), payment._id.toString(), 'REFUNDED', {});

      const result = await applyAsaasPaymentStatus(
        Tenant.toString(),
        payment._id.toString(),
        'CHARGEBACK_REQUESTED',
        {},
      );

      expect((result as PaymentDocument).status).toBe('refunded');
    });
  });

  describe('expireOrderPayment — releases stock and sets Order.status (spec.md P1 "Cobrança não paga expira e libera o estoque"/AC1, PAY-11/PAY-12)', () => {
    it('expires a pending Payment: releases every item stock, sets Payment.status expired and Order.status payment_expired', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const productA = await seedProduct(Tenant, { name: 'Produto A', stock: 3 });
      const productB = await seedProduct(Tenant, { name: 'Produto B', stock: 1 });
      const order = await seedOrder(Tenant, [
        { product: productA._id, name: 'Produto A', unitPrice: 1000, quantity: 2 },
        { product: productB._id, name: 'Produto B', unitPrice: 2000, quantity: 1 },
      ]);
      const payment = await seedPayment(Tenant, order._id, { value: 4000 });

      const result = await expireOrderPayment(Tenant.toString(), payment._id.toString());

      expect(isError(result)).toBe(false);
      expect((result as PaymentDocument).status).toBe('expired');
      const reloadedOrder = await Order.findById(order._id).lean();
      expect(reloadedOrder?.status).toBe('payment_expired');
      const reloadedA = await Product.findById(productA._id).lean();
      const reloadedB = await Product.findById(productB._id).lean();
      expect(reloadedA?.stock).toBe(5); // 3 + 2 liberado
      expect(reloadedB?.stock).toBe(2); // 1 + 1 liberado
    });

    it('is a no-op on a Payment that already left pending (e.g. paid) — stock and Order.status untouched', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const product = await seedProduct(Tenant, { stock: 3 });
      const order = await seedOrder(Tenant, [
        { product: product._id, name: 'Produto Teste', unitPrice: 1000, quantity: 2 },
      ]);
      const payment = await seedPayment(Tenant, order._id, { status: 'paid', asaasStatus: 'CONFIRMED' });

      const result = await expireOrderPayment(Tenant.toString(), payment._id.toString());

      expect(isError(result)).toBe(false);
      expect((result as PaymentDocument).status).toBe('paid');
      const reloadedOrder = await Order.findById(order._id).lean();
      expect(reloadedOrder?.status).toBe('confirmed');
      const reloadedProduct = await Product.findById(product._id).lean();
      expect(reloadedProduct?.stock).toBe(3);
    });

    it('is a no-op on the second call for the same pending Payment — does not double-release stock', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const product = await seedProduct(Tenant, { stock: 3 });
      const order = await seedOrder(Tenant, [
        { product: product._id, name: 'Produto Teste', unitPrice: 1000, quantity: 2 },
      ]);
      const payment = await seedPayment(Tenant, order._id);

      const first = await expireOrderPayment(Tenant.toString(), payment._id.toString());
      expect((first as PaymentDocument).status).toBe('expired');
      const second = await expireOrderPayment(Tenant.toString(), payment._id.toString());

      expect(isError(second)).toBe(false);
      expect((second as PaymentDocument).status).toBe('expired');
      const reloadedProduct = await Product.findById(product._id).lean();
      // 3 + 2 liberado UMA vez só — a 2ª chamada não soma outros +2.
      expect(reloadedProduct?.stock).toBe(5);
    });

    it('returns {error} for a non-existent paymentId', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const result = await expireOrderPayment(Tenant.toString(), new mongoose.Types.ObjectId().toString());

      expect(isError(result)).toBe(true);
    });

    it('returns {error} for a Payment belonging to a DIFFERENT tenant, leaving stock and Order untouched', async () => {
      const ownerTenant = new mongoose.Types.ObjectId();
      const intruderTenant = new mongoose.Types.ObjectId();
      const product = await seedProduct(ownerTenant, { stock: 3 });
      const order = await seedOrder(ownerTenant, [
        { product: product._id, name: 'Produto Teste', unitPrice: 1000, quantity: 2 },
      ]);
      const payment = await seedPayment(ownerTenant, order._id);

      const result = await expireOrderPayment(intruderTenant.toString(), payment._id.toString());

      expect(isError(result)).toBe(true);
      const reloadedOrder = await Order.findById(order._id).lean();
      expect(reloadedOrder?.status).toBe('confirmed');
      const reloadedProduct = await Product.findById(product._id).lean();
      expect(reloadedProduct?.stock).toBe(3);
    });
  });
});
