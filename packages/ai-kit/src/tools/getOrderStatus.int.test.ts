import crypto from 'node:crypto';
import { connect, disconnect, Order, Payment } from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getOrderStatus } from './getOrderStatus.js';
import type { ToolContext } from './toolContext.js';

// Sem `mongoose` aqui (AD-010/boundary) — mesmo padrão de openProcess.int.test.ts.
const randomId = (): string => crypto.randomBytes(12).toString('hex');

const baseCtx = (tenantId: string, conversationId: string): ToolContext => ({
  tenantId,
  channelId: randomId(),
  conversationId,
});

const seedOrder = async (tenantId: string, conversationId: string, overrides: Partial<Record<string, unknown>> = {}) =>
  Order.create({
    Tenant: tenantId,
    conversation: conversationId,
    customer: randomId(),
    items: [{ product: randomId(), name: 'Produto', unitPrice: 1000, quantity: 2 }],
    totalPrice: 2000,
    idempotencyKey: randomId(),
    ...overrides,
  });

describe('getOrderStatus tool (spec.md P1 "Cliente pesquisa produtos e consulta status do pedido"/AC3/AC4)', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
  });

  afterEach(async () => {
    await Order.deleteMany({});
    await Payment.deleteMany({});
  });

  afterAll(async () => {
    await disconnect();
  });

  it('returns the status/items/total for an orderId that belongs to the SAME conversation (spec.md AC3)', async () => {
    const tenant = randomId();
    const conversation = randomId();
    const order = await seedOrder(tenant, conversation);

    const result = await getOrderStatus({ orderId: order._id.toString() }, baseCtx(tenant, conversation));

    expect(result).toEqual({
      orderId: order._id.toString(),
      status: 'pending_approval',
      items: [{ productId: expect.any(String), name: 'Produto', unitPrice: 1000, quantity: 2 }],
      totalPrice: 2000,
      customerConfirmed: false,
      operatorApproved: false,
    });
  });

  it('returns {error} for an orderId that belongs to ANOTHER conversation, never leaking the data (spec.md AC3)', async () => {
    const tenant = randomId();
    const conversation = randomId();
    const otherConversation = randomId();
    const order = await seedOrder(tenant, otherConversation);

    const result = await getOrderStatus({ orderId: order._id.toString() }, baseCtx(tenant, conversation));

    expect(result).toEqual({ error: expect.any(String) });
  });

  it('returns {error} for an orderId of ANOTHER tenant, even with a matching conversationId (spec.md Edge Cases, defense in depth)', async () => {
    const conversation = randomId();
    const order = await seedOrder(randomId(), conversation);

    const result = await getOrderStatus({ orderId: order._id.toString() }, baseCtx(randomId(), conversation));

    expect(result).toEqual({ error: expect.any(String) });
  });

  it('without orderId, returns the most recent Order of that conversation (spec.md AC4)', async () => {
    const tenant = randomId();
    const conversation = randomId();
    await seedOrder(tenant, conversation);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const newer = await seedOrder(tenant, conversation);

    const result = await getOrderStatus({}, baseCtx(tenant, conversation));

    expect((result as { orderId: string }).orderId).toBe(newer._id.toString());
  });

  it('without orderId, returns {error} when the conversation has no Order at all (spec.md AC4)', async () => {
    const result = await getOrderStatus({}, baseCtx(randomId(), randomId()));

    expect(result).toEqual({ error: expect.any(String) });
  });

  // payments-asaas T19 (spec.md P1 AC5 / PAY-05): a chave `payment` deve
  // ficar AUSENTE do objeto (não `undefined`) quando o Order não tem nenhum
  // Payment — `in` prova ausência de verdade, ao contrário de
  // `toBe(undefined)` (que passaria mesmo se a chave existisse com valor
  // undefined, um falso verde).
  it('an Order with NO Payment omits the "payment" key entirely (PAY-05, not just undefined)', async () => {
    const tenant = randomId();
    const conversation = randomId();
    const order = await seedOrder(tenant, conversation);

    const result = await getOrderStatus({ orderId: order._id.toString() }, baseCtx(tenant, conversation));

    expect('payment' in result).toBe(false);
  });

  it('an Order WITH a Payment includes payment.status/pixPayload from the associated Payment record (PAY-05)', async () => {
    const tenant = randomId();
    const conversation = randomId();
    const order = await seedOrder(tenant, conversation, { status: 'confirmed' });
    await Payment.create({
      Tenant: tenant,
      order: order._id,
      asaasChargeId: randomId(),
      asaasCustomerId: randomId(),
      billingType: 'PIX',
      value: order.totalPrice,
      status: 'paid',
      asaasStatus: 'CONFIRMED',
      pixPayload: '00020126-fake-pix-payload',
    });

    const result = await getOrderStatus({ orderId: order._id.toString() }, baseCtx(tenant, conversation));

    expect('payment' in result).toBe(true);
    expect((result as { payment?: { status: string; pixPayload?: string } }).payment).toEqual({
      status: 'paid',
      pixPayload: '00020126-fake-pix-payload',
    });
  });
});
