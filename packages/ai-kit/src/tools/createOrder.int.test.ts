import crypto from 'node:crypto';
import { Channel, Conversation, Customer, connect, disconnect, Order, Product } from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createOrder } from './createOrder.js';
import type { ToolContext } from './toolContext.js';

// Sem `mongoose` aqui (AD-010/boundary) — mesmo padrão de openProcess.int.test.ts.
const randomId = (): string => crypto.randomBytes(12).toString('hex');

const seedConversation = async (tenantId: string) => {
  const channel = await Channel.create({
    Tenant: tenantId,
    phoneNumberId: randomId(),
    accessTokenEnc: { ciphertext: 'c', iv: 'i', authTag: 'a' },
    status: 'active',
  });
  const customer = await Customer.create({
    Tenant: tenantId,
    name: 'Cliente Teste',
    phone: '11900000000',
    template: randomId(),
    templateVersion: 1,
    values: {},
  });
  const conversation = await Conversation.create({
    Tenant: tenantId,
    Channel: channel._id,
    Customer: customer._id,
    mode: 'bot',
    lastActivityAt: new Date(),
  });
  return { channel, customer, conversation };
};

const baseCtx = (tenantId: string, conversationId: string): ToolContext => ({
  tenantId,
  channelId: randomId(),
  conversationId,
});

describe('createOrder tool (spec.md P1 "Cliente monta e confirma um pedido"/AC1-6)', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
  });

  afterEach(async () => {
    await Promise.all([
      Order.deleteMany({}),
      Product.deleteMany({}),
      Conversation.deleteMany({}),
      Customer.deleteMany({}),
      Channel.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await disconnect();
  });

  describe('1ª chamada (sem customerConfirmed)', () => {
    it('creates a pending_approval Order with customerConfirmed:false, item snapshot and computed totalPrice (spec.md AC1)', async () => {
      const tenant = randomId();
      const { conversation, customer } = await seedConversation(tenant);
      const productA = await Product.create({ Tenant: tenant, name: 'Camiseta', price: 1000, stock: 10, active: true });
      const productB = await Product.create({ Tenant: tenant, name: 'Calça', price: 5000, stock: 10, active: true });

      const result = await createOrder(
        {
          items: [
            { productId: productA._id.toString(), quantity: 2 },
            { productId: productB._id.toString(), quantity: 1 },
          ],
          idempotencyKey: 'pedido-1',
        },
        baseCtx(tenant, conversation._id.toString()),
      );

      expect(result).toEqual({
        orderId: expect.any(String),
        status: 'pending_approval',
        items: [
          { productId: productA._id.toString(), name: 'Camiseta', unitPrice: 1000, quantity: 2 },
          { productId: productB._id.toString(), name: 'Calça', unitPrice: 5000, quantity: 1 },
        ],
        totalPrice: 7000,
        customerConfirmed: false,
        operatorApproved: false,
      });
      const persisted = await Order.findById((result as { orderId: string }).orderId).lean();
      expect(persisted?.customer.toString()).toBe(customer._id.toString());
    });

    it('returns {error} and creates nothing for a non-existent productId (spec.md AC2)', async () => {
      const tenant = randomId();
      const { conversation } = await seedConversation(tenant);

      const result = await createOrder(
        { items: [{ productId: randomId(), quantity: 1 }], idempotencyKey: 'pedido-2' },
        baseCtx(tenant, conversation._id.toString()),
      );

      expect(result).toEqual({ error: expect.any(String) });
      expect(await Order.countDocuments({})).toBe(0);
    });

    it('returns {error} and creates nothing for an active:false productId (spec.md AC2)', async () => {
      const tenant = randomId();
      const { conversation } = await seedConversation(tenant);
      const product = await Product.create({ Tenant: tenant, name: 'Inativo', price: 1000, stock: 5, active: false });

      const result = await createOrder(
        { items: [{ productId: product._id.toString(), quantity: 1 }], idempotencyKey: 'pedido-3' },
        baseCtx(tenant, conversation._id.toString()),
      );

      expect(result).toEqual({ error: expect.any(String) });
      expect(await Order.countDocuments({})).toBe(0);
    });

    it('returns {error} and creates nothing for a quantity outside 1..100 (spec.md AC2/Assumptions)', async () => {
      const tenant = randomId();
      const { conversation } = await seedConversation(tenant);
      const product = await Product.create({ Tenant: tenant, name: 'Produto', price: 1000, stock: 500, active: true });

      const zeroResult = await createOrder(
        { items: [{ productId: product._id.toString(), quantity: 0 }], idempotencyKey: 'pedido-4' },
        baseCtx(tenant, conversation._id.toString()),
      );
      const tooManyResult = await createOrder(
        { items: [{ productId: product._id.toString(), quantity: 101 }], idempotencyKey: 'pedido-5' },
        baseCtx(tenant, conversation._id.toString()),
      );
      const notIntegerResult = await createOrder(
        { items: [{ productId: product._id.toString(), quantity: 1.5 }], idempotencyKey: 'pedido-6' },
        baseCtx(tenant, conversation._id.toString()),
      );

      expect(zeroResult).toEqual({ error: expect.any(String) });
      expect(tooManyResult).toEqual({ error: expect.any(String) });
      expect(notIntegerResult).toEqual({ error: expect.any(String) });
      expect(await Order.countDocuments({})).toBe(0);
    });

    it('returns {error} and creates nothing for an empty items array (spec.md Edge Cases)', async () => {
      const tenant = randomId();
      const { conversation } = await seedConversation(tenant);

      const result = await createOrder(
        { items: [], idempotencyKey: 'pedido-7' },
        baseCtx(tenant, conversation._id.toString()),
      );

      expect(result).toEqual({ error: expect.any(String) });
      expect(await Order.countDocuments({})).toBe(0);
    });

    it('returns {error} without overwriting the first Order when the same idempotencyKey is reused (by accident) with DIFFERENT items (spec.md Edge Cases)', async () => {
      const tenant = randomId();
      const { conversation } = await seedConversation(tenant);
      const productA = await Product.create({ Tenant: tenant, name: 'Camiseta', price: 1000, stock: 10, active: true });
      const productB = await Product.create({ Tenant: tenant, name: 'Calça', price: 5000, stock: 10, active: true });
      const first = await createOrder(
        { items: [{ productId: productA._id.toString(), quantity: 1 }], idempotencyKey: 'key-colisao' },
        baseCtx(tenant, conversation._id.toString()),
      );

      const second = await createOrder(
        { items: [{ productId: productB._id.toString(), quantity: 1 }], idempotencyKey: 'key-colisao' },
        baseCtx(tenant, conversation._id.toString()),
      );

      expect(second).toEqual({ error: expect.any(String) });
      expect(await Order.countDocuments({})).toBe(1);
      const persisted = await Order.findById((first as { orderId: string }).orderId).lean();
      expect(persisted?.items).toHaveLength(1);
      expect(persisted?.items[0]?.product.toString()).toBe(productA._id.toString());
    });

    it('returns the existing Order (idempotent retry) when the same idempotencyKey is reused with IDENTICAL items, creating nothing new', async () => {
      const tenant = randomId();
      const { conversation } = await seedConversation(tenant);
      const product = await Product.create({ Tenant: tenant, name: 'Produto', price: 1000, stock: 10, active: true });
      const first = await createOrder(
        { items: [{ productId: product._id.toString(), quantity: 1 }], idempotencyKey: 'key-retry' },
        baseCtx(tenant, conversation._id.toString()),
      );

      const second = await createOrder(
        { items: [{ productId: product._id.toString(), quantity: 1 }], idempotencyKey: 'key-retry' },
        baseCtx(tenant, conversation._id.toString()),
      );

      expect(second).toEqual(first);
      expect(await Order.countDocuments({})).toBe(1);
    });
  });

  describe('2ª chamada (customerConfirmed:true)', () => {
    it('marks customerConfirmed:true on the SAME Order (never a second one) when items match (spec.md AC3)', async () => {
      const tenant = randomId();
      const { conversation } = await seedConversation(tenant);
      const product = await Product.create({ Tenant: tenant, name: 'Produto', price: 1000, stock: 10, active: true });
      const created = await createOrder(
        { items: [{ productId: product._id.toString(), quantity: 1 }], idempotencyKey: 'key-confirm' },
        baseCtx(tenant, conversation._id.toString()),
      );

      const result = await createOrder(
        {
          items: [{ productId: product._id.toString(), quantity: 1 }],
          idempotencyKey: 'key-confirm',
          customerConfirmed: true,
        },
        baseCtx(tenant, conversation._id.toString()),
      );

      expect((result as { orderId: string }).orderId).toBe((created as { orderId: string }).orderId);
      expect((result as { customerConfirmed: boolean }).customerConfirmed).toBe(true);
      expect(await Order.countDocuments({})).toBe(1);
    });

    it('returns {error} and leaves the original Order untouched when items diverge from the first call (spec.md AC4)', async () => {
      const tenant = randomId();
      const { conversation } = await seedConversation(tenant);
      const product = await Product.create({ Tenant: tenant, name: 'Produto', price: 1000, stock: 10, active: true });
      await createOrder(
        { items: [{ productId: product._id.toString(), quantity: 1 }], idempotencyKey: 'key-diverge' },
        baseCtx(tenant, conversation._id.toString()),
      );

      const result = await createOrder(
        {
          items: [{ productId: product._id.toString(), quantity: 2 }],
          idempotencyKey: 'key-diverge',
          customerConfirmed: true,
        },
        baseCtx(tenant, conversation._id.toString()),
      );

      expect(result).toEqual({ error: expect.any(String) });
      const persisted = await Order.findOne({ idempotencyKey: 'key-diverge' }).lean();
      expect(persisted?.customerConfirmed).toBe(false);
      expect(persisted?.items[0]?.quantity).toBe(1);
    });

    it('returns {error} when no pending_approval Order matches the idempotencyKey (spec.md AC5)', async () => {
      const tenant = randomId();
      const { conversation } = await seedConversation(tenant);
      const product = await Product.create({ Tenant: tenant, name: 'Produto', price: 1000, stock: 10, active: true });

      const result = await createOrder(
        {
          items: [{ productId: product._id.toString(), quantity: 1 }],
          idempotencyKey: 'key-inexistente',
          customerConfirmed: true,
        },
        baseCtx(tenant, conversation._id.toString()),
      );

      expect(result).toEqual({ error: expect.any(String) });
    });

    it('returns the CURRENT state without mutating when the idempotencyKey already points to a terminal Order (spec.md AC6)', async () => {
      const tenant = randomId();
      const { conversation } = await seedConversation(tenant);
      const product = await Product.create({ Tenant: tenant, name: 'Produto', price: 1000, stock: 10, active: true });
      const order = await Order.create({
        Tenant: tenant,
        conversation: conversation._id,
        customer: conversation.Customer,
        items: [{ product: product._id, name: 'Produto', unitPrice: 1000, quantity: 1 }],
        totalPrice: 1000,
        idempotencyKey: 'key-terminal',
        status: 'rejected',
        customerConfirmed: false,
      });

      const result = await createOrder(
        {
          items: [{ productId: product._id.toString(), quantity: 1 }],
          idempotencyKey: 'key-terminal',
          customerConfirmed: true,
        },
        baseCtx(tenant, conversation._id.toString()),
      );

      expect(result).toEqual({
        orderId: order._id.toString(),
        status: 'rejected',
        items: [{ productId: product._id.toString(), name: 'Produto', unitPrice: 1000, quantity: 1 }],
        totalPrice: 1000,
        customerConfirmed: false,
        operatorApproved: false,
      });
      const persisted = await Order.findById(order._id).lean();
      expect(persisted?.status).toBe('rejected');
    });
  });
});
