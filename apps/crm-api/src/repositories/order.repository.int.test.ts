import crypto from 'node:crypto';
import { Customer, connect, disconnect, Order } from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import * as orderRepository from './order.repository.js';

// Sem `mongoose` aqui (AD-010/boundary estrutural: só packages/db importa
// mongoose) — mesmo padrão de product.repository.int.test.ts.
const randomId = (): string => crypto.randomBytes(12).toString('hex');

const seedOrder = async (tenantId: string, overrides: Partial<Record<string, unknown>> = {}) =>
  Order.create({
    Tenant: tenantId,
    conversation: randomId(),
    customer: randomId(),
    items: [{ product: randomId(), name: 'Produto', unitPrice: 1000, quantity: 1 }],
    totalPrice: 1000,
    idempotencyKey: randomId(),
    ...overrides,
  });

describe('order.repository', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
  });

  afterEach(async () => {
    await Promise.all([Order.deleteMany({}), Customer.deleteMany({})]);
  });

  afterAll(async () => {
    await disconnect();
  });

  describe('findById', () => {
    it('returns the Order for its own tenant', async () => {
      const tenantId = randomId();
      const created = await seedOrder(tenantId);

      const result = await orderRepository.findById(tenantId, created._id.toString());

      expect(result?.id).toBe(created._id.toString());
      expect(result?.status).toBe('pending_approval');
      expect(result?.totalPrice).toBe(1000);
    });

    it('returns null for an Order that belongs to a DIFFERENT tenant (AD-010)', async () => {
      const owner = randomId();
      const intruder = randomId();
      const created = await seedOrder(owner);

      const result = await orderRepository.findById(intruder, created._id.toString());

      expect(result).toBeNull();
    });
  });

  describe('listOrders', () => {
    it('with no status filter, returns Orders of every status (T8 Done when: "default nenhum — todos")', async () => {
      const tenantId = randomId();
      await seedOrder(tenantId, { status: 'pending_approval' });
      await seedOrder(tenantId, { status: 'confirmed' });
      await seedOrder(tenantId, { status: 'rejected' });

      const result = await orderRepository.listOrders(tenantId, { page: 1, limit: 20 });

      expect(result.total).toBe(3);
      expect(result.items.map((item) => item.status).sort()).toEqual(['confirmed', 'pending_approval', 'rejected']);
    });

    it('filters by status when given', async () => {
      const tenantId = randomId();
      await seedOrder(tenantId, { status: 'pending_approval' });
      await seedOrder(tenantId, { status: 'confirmed' });

      const result = await orderRepository.listOrders(tenantId, { page: 1, limit: 20, status: 'pending_approval' });

      expect(result.total).toBe(1);
      expect(result.items[0]?.status).toBe('pending_approval');
    });

    it('filters by conversation when given (T24, card inline do Inbox de uma conversation)', async () => {
      const tenantId = randomId();
      const conversationId = randomId();
      await seedOrder(tenantId, { conversation: conversationId });
      await seedOrder(tenantId);

      const result = await orderRepository.listOrders(tenantId, { page: 1, limit: 20, conversation: conversationId });

      expect(result.total).toBe(1);
      expect(result.items[0]?.conversation).toBe(conversationId);
    });

    it("never returns another tenant's Order and respects pagination (AD-010)", async () => {
      const tenantId = randomId();
      const otherTenant = randomId();
      await seedOrder(otherTenant);
      for (let i = 0; i < 3; i += 1) {
        await seedOrder(tenantId);
      }

      const result = await orderRepository.listOrders(tenantId, { page: 1, limit: 2 });

      expect(result.total).toBe(3);
      expect(result.items).toHaveLength(2);
    });

    it('populates customer.name on each item (design.md: "popula customer.name")', async () => {
      const tenantId = randomId();
      const customer = await Customer.create({
        Tenant: tenantId,
        name: 'Cliente Teste',
        phone: '11900000000',
        template: randomId(),
        templateVersion: 1,
        values: {},
      });
      await seedOrder(tenantId, { customer: customer._id });

      const result = await orderRepository.listOrders(tenantId, { page: 1, limit: 20 });

      expect(result.items[0]?.customer).toBe(customer._id.toString());
      expect(result.items[0]?.customerName).toBe('Cliente Teste');
    });

    it('sorts by createdAt desc (same index as the Pedidos queue, order.model.ts)', async () => {
      const tenantId = randomId();
      const older = await seedOrder(tenantId);
      await new Promise((resolve) => setTimeout(resolve, 5));
      const newer = await seedOrder(tenantId);

      const result = await orderRepository.listOrders(tenantId, { page: 1, limit: 20 });

      expect(result.items.map((item) => item.id)).toEqual([newer._id.toString(), older._id.toString()]);
    });
  });
});
