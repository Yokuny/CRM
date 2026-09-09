import crypto from 'node:crypto';
import { connect, disconnect, Order } from '@crm/db';
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
});
