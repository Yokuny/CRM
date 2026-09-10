import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../tests/helpers/db.helper.js';
import { Order } from './order.model.js';

const baseOrder = (Tenant: mongoose.Types.ObjectId, overrides: Partial<Record<string, unknown>> = {}) => ({
  Tenant,
  conversation: new mongoose.Types.ObjectId(),
  customer: new mongoose.Types.ObjectId(),
  items: [{ product: new mongoose.Types.ObjectId(), name: 'Produto Teste', unitPrice: 1000, quantity: 1 }],
  totalPrice: 1000,
  idempotencyKey: `key-${new mongoose.Types.ObjectId().toString()}`,
  customerConfirmed: false,
  operatorApproved: false,
  ...overrides,
});

describe('Order model', () => {
  useTestDb();

  // payments-asaas (design.md, additive enum value): 'payment_expired' junta-se
  // a pending_approval|confirmed|rejected como um 4º status persistível
  // (PAY-11/PAY-12) — cobrança não paga expira e libera o estoque.
  it('persists and reloads an Order with status payment_expired', async () => {
    const Tenant = new mongoose.Types.ObjectId();
    const created = await Order.create(baseOrder(Tenant, { status: 'payment_expired' }));

    const reloaded = await Order.findById(created._id).lean();

    expect(reloaded?.status).toBe('payment_expired');
  });
});
