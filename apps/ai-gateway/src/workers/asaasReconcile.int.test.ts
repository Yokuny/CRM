import crypto from 'node:crypto';
import type { AsaasClient } from '@crm/ai-kit';
import { AsaasEvent, AsaasIntegration, connect, disconnect, Order, type OrderItem, Payment, Product } from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PAYMENT_EXPIRATION_HOURS, runAsaasReconcileTick } from './asaasReconcile.js';

// Mesmo idioma de seed de packages/db/src/paymentTransitions.int.test.ts
// (Product/Order/Payment diretos via Mongoose, sem passar por runTurn) —
// este worker não é acionado pelo modelo, então não há harness de conversa
// pra reusar aqui. `randomId` (hex de 24 chars, mesmo idioma dos outros
// testes de apps/ai-gateway, ex.: wamidDedup.int.test.ts) no lugar de
// mongoose.Types.ObjectId — apps/ai-gateway não depende de mongoose direto.
const randomId = (): string => crypto.randomBytes(12).toString('hex');

const seedProduct = (Tenant: string, overrides: Partial<Record<string, unknown>> = {}) =>
  Product.create({ Tenant, name: 'Produto Teste', price: 1000, stock: 5, active: true, ...overrides });

const seedOrder = (Tenant: string, items: OrderItem[], overrides: Partial<Record<string, unknown>> = {}) =>
  Order.create({
    Tenant,
    conversation: randomId(),
    customer: randomId(),
    items,
    totalPrice: items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    status: 'confirmed',
    idempotencyKey: `key-${randomId()}`,
    customerConfirmed: true,
    operatorApproved: true,
    ...overrides,
  });

const seedPayment = (Tenant: string, order: string, overrides: Partial<Record<string, unknown>> = {}) =>
  Payment.create({
    Tenant,
    order,
    asaasChargeId: `pay_${randomId()}`,
    asaasCustomerId: 'cus_teste',
    billingType: 'PIX' as const,
    value: 1000,
    asaasStatus: 'PENDING',
    status: 'pending',
    ...overrides,
  });

const seedIntegration = (Tenant: string, overrides: Partial<Record<string, unknown>> = {}) =>
  AsaasIntegration.create({
    Tenant,
    apiKeyEnc: { ciphertext: 'c', iv: 'i', authTag: 'a' },
    environment: 'sandbox' as const,
    webhookToken: `wht_${randomId()}`,
    webhookAuthTokenHash: 'hash-fixo-de-teste',
    status: 'active' as const,
    ...overrides,
  });

type GetChargeImpl = (...args: Parameters<AsaasClient['getCharge']>) => ReturnType<AsaasClient['getCharge']>;

const fakeAsaasClient = (getCharge: GetChargeImpl): AsaasClient => ({
  ensureCustomer: vi.fn(),
  createPixCharge: vi.fn(),
  getCharge: vi.fn(getCharge),
});

// Bem além da janela de 24h (PAYMENT_EXPIRATION_HOURS) — nunca hardcoded como
// "24", sempre derivado da constante exportada pelo próprio worker.
const OLD_CREATED_AT = new Date(Date.now() - (PAYMENT_EXPIRATION_HOURS + 1) * 60 * 60 * 1000);

describe('asaasReconcile (spec.md P1 "Webhook + rede de segurança"/AC6, "Cobrança não paga expira e libera o estoque"/AC1-2, PAY-10/PAY-11)', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
    await AsaasIntegration.init();
    await AsaasEvent.init();
    await Payment.init();
  });

  afterEach(async () => {
    await Promise.all([
      AsaasIntegration.deleteMany({}),
      AsaasEvent.deleteMany({}),
      Payment.deleteMany({}),
      Order.deleteMany({}),
      Product.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await disconnect();
  });

  it('expires a pending Payment past the 24h window when Asaas still reports it unpaid — releases stock and sets Order.status to payment_expired (AC1)', async () => {
    const Tenant = randomId();
    await seedIntegration(Tenant);
    const product = await seedProduct(Tenant, { stock: 3 });
    const order = await seedOrder(Tenant, [
      { product: product._id, name: 'Produto Teste', unitPrice: 1000, quantity: 2 },
    ]);
    const payment = await seedPayment(Tenant, order._id.toString(), { createdAt: OLD_CREATED_AT });
    const asaasClient = fakeAsaasClient(async () => ({ asaasStatus: 'PENDING' }));

    await runAsaasReconcileTick({ asaasClient });

    const updatedPayment = await Payment.findById(payment._id).lean();
    expect(updatedPayment?.status).toBe('expired');
    const updatedOrder = await Order.findById(order._id).lean();
    expect(updatedOrder?.status).toBe('payment_expired');
    const updatedProduct = await Product.findById(product._id).lean();
    expect(updatedProduct?.stock).toBe(5); // 3 + 2 liberado
  });

  it('marks a pending Payment paid when Asaas now reports it paid, even past the 24h window — Order stays confirmed, never expired in the same tick (AC2)', async () => {
    const Tenant = randomId();
    await seedIntegration(Tenant);
    const product = await seedProduct(Tenant, { stock: 3 });
    const order = await seedOrder(Tenant, [
      { product: product._id, name: 'Produto Teste', unitPrice: 1000, quantity: 2 },
    ]);
    const payment = await seedPayment(Tenant, order._id.toString(), { createdAt: OLD_CREATED_AT });
    const asaasClient = fakeAsaasClient(async () => ({ asaasStatus: 'CONFIRMED' }));

    await runAsaasReconcileTick({ asaasClient });

    const updatedPayment = await Payment.findById(payment._id).lean();
    expect(updatedPayment?.status).toBe('paid');
    const updatedOrder = await Order.findById(order._id).lean();
    expect(updatedOrder?.status).toBe('confirmed');
    const updatedProduct = await Product.findById(product._id).lean();
    expect(updatedProduct?.stock).toBe(3);
  });

  it('retries a failed AsaasEvent from its own stored payload (never re-fetching from Asaas) — success marks it processed and applies the status', async () => {
    const Tenant = randomId();
    await seedIntegration(Tenant);
    const product = await seedProduct(Tenant);
    const order = await seedOrder(Tenant, [
      { product: product._id, name: 'Produto Teste', unitPrice: 1000, quantity: 1 },
    ]);
    const payment = await seedPayment(Tenant, order._id.toString(), { asaasChargeId: 'ch_retry_ok' });
    const event = await AsaasEvent.create({
      Tenant,
      asaasEventId: 'evt_retry_ok',
      event: 'PAYMENT_CONFIRMED',
      payload: { payment: { id: 'ch_retry_ok', status: 'CONFIRMED' } },
      status: 'failed',
      attempts: 1,
      error: 'falha anterior',
      receivedAt: new Date(),
    });
    // getCharge nunca deveria ser chamado pelo caminho de retry de evento —
    // só o poll de Payment pending o usa.
    const getCharge = vi.fn();
    const asaasClient: AsaasClient = { ensureCustomer: vi.fn(), createPixCharge: vi.fn(), getCharge };

    await runAsaasReconcileTick({ asaasClient });

    const updatedEvent = await AsaasEvent.findById(event._id).lean();
    expect(updatedEvent?.status).toBe('processed');
    expect(updatedEvent?.processedAt).toBeInstanceOf(Date);
    const updatedPayment = await Payment.findById(payment._id).lean();
    expect(updatedPayment?.status).toBe('paid');
    expect(getCharge).not.toHaveBeenCalled();
  });

  it('keeps a failed AsaasEvent failed and increments attempts/updates the error when the retry fails again', async () => {
    const Tenant = randomId();
    await seedIntegration(Tenant);
    const event = await AsaasEvent.create({
      Tenant,
      asaasEventId: 'evt_retry_fail',
      event: 'PAYMENT_CONFIRMED',
      // Nenhum Payment com este asaasChargeId existe — a retentativa falha de
      // novo, exatamente como uma falha real de reprocessamento faria.
      payload: { payment: { id: 'ch_nao_existe', status: 'CONFIRMED' } },
      status: 'failed',
      attempts: 1,
      error: 'falha anterior',
      receivedAt: new Date(),
    });
    const asaasClient = fakeAsaasClient(async () => ({ asaasStatus: 'PENDING' }));

    await runAsaasReconcileTick({ asaasClient });

    const updatedEvent = await AsaasEvent.findById(event._id).lean();
    expect(updatedEvent?.status).toBe('failed');
    expect(updatedEvent?.attempts).toBe(2);
    expect(updatedEvent?.error).toEqual(expect.any(String));
  });

  it("one tenant's Asaas-call failure never blocks the SAME tick from processing another tenant's Payment (spec.md Edge Cases)", async () => {
    const tenantA = randomId();
    const tenantB = randomId();
    await seedIntegration(tenantA);
    await seedIntegration(tenantB);
    const productA = await seedProduct(tenantA);
    const orderA = await seedOrder(tenantA, [
      { product: productA._id, name: 'Produto A', unitPrice: 1000, quantity: 1 },
    ]);
    const paymentA = await seedPayment(tenantA, orderA._id.toString(), { asaasChargeId: 'ch_a_falha' });
    const productB = await seedProduct(tenantB);
    const orderB = await seedOrder(tenantB, [
      { product: productB._id, name: 'Produto B', unitPrice: 1000, quantity: 1 },
    ]);
    const paymentB = await seedPayment(tenantB, orderB._id.toString(), { asaasChargeId: 'ch_b_ok' });

    const asaasClient = fakeAsaasClient(async (_integration, asaasChargeId) => {
      if (asaasChargeId === 'ch_a_falha') throw new Error('Asaas indisponível para o tenant A');
      return { asaasStatus: 'CONFIRMED' };
    });

    await runAsaasReconcileTick({ asaasClient });

    const updatedA = await Payment.findById(paymentA._id).lean();
    expect(updatedA?.status).toBe('pending'); // falhou, mas não travou o tick
    const updatedB = await Payment.findById(paymentB._id).lean();
    expect(updatedB?.status).toBe('paid'); // processado normalmente na MESMA execução
  });
});
