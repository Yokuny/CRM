import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../tests/helpers/db.helper.js';
import type { OrderDocument } from './models/order.model.js';
import { Order } from './models/order.model.js';
import { Product } from './models/product.model.js';
import { rejectOrder, setCustomerConfirmed, setOperatorApproved, tryConfirmOrder } from './orderTransitions.js';

const seedProduct = (Tenant: mongoose.Types.ObjectId, overrides: Partial<Record<string, unknown>> = {}) =>
  Product.create({ Tenant, name: 'Produto Teste', price: 1000, stock: 5, active: true, ...overrides });

const seedOrder = (
  Tenant: mongoose.Types.ObjectId,
  items: { product: mongoose.Types.ObjectId; name: string; unitPrice: number; quantity: number }[],
  overrides: Partial<Record<string, unknown>> = {},
) =>
  Order.create({
    Tenant,
    conversation: new mongoose.Types.ObjectId(),
    customer: new mongoose.Types.ObjectId(),
    items,
    totalPrice: items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    status: 'pending_approval',
    idempotencyKey: `key-${new mongoose.Types.ObjectId().toString()}`,
    customerConfirmed: false,
    operatorApproved: false,
    ...overrides,
  });

const isError = (result: unknown): result is { error: string } =>
  typeof result === 'object' && result !== null && 'error' in result;

// Placeholder de userId — precisa ser um ObjectId de 24-hex válido (o schema
// de Order faz cast real), o valor em si é irrelevante para estes cenários.
const OPERATOR_USER_ID = new mongoose.Types.ObjectId().toString();

describe('orderTransitions', () => {
  useTestDb();

  describe('setCustomerConfirmed / setOperatorApproved — single condition (CAT-14/CAT-21)', () => {
    it('setCustomerConfirmed alone marks customerConfirmed:true but keeps status pending_approval and stock untouched', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const product = await seedProduct(Tenant, { stock: 5 });
      const order = await seedOrder(Tenant, [
        { product: product._id, name: 'Produto Teste', unitPrice: 1000, quantity: 2 },
      ]);

      const result = await setCustomerConfirmed(Tenant.toString(), order._id.toString(), [
        { productId: product._id.toString(), quantity: 2 },
      ]);

      expect(isError(result)).toBe(false);
      const updated = result as OrderDocument;
      expect(updated.customerConfirmed).toBe(true);
      expect(updated.status).toBe('pending_approval');
      const reloadedProduct = await Product.findById(product._id).lean();
      expect(reloadedProduct?.stock).toBe(5);
    });

    it('setOperatorApproved alone marks operatorApproved/approvedBy/approvedAt but keeps status pending_approval and stock untouched', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId().toString();
      const product = await seedProduct(Tenant, { stock: 5 });
      const order = await seedOrder(Tenant, [
        { product: product._id, name: 'Produto Teste', unitPrice: 1000, quantity: 2 },
      ]);

      const result = await setOperatorApproved(Tenant.toString(), order._id.toString(), userId);

      expect(isError(result)).toBe(false);
      const updated = result as OrderDocument;
      expect(updated.operatorApproved).toBe(true);
      expect(updated.approvedBy?.toString()).toBe(userId);
      expect(updated.approvedAt).toBeInstanceOf(Date);
      expect(updated.status).toBe('pending_approval');
      const reloadedProduct = await Product.findById(product._id).lean();
      expect(reloadedProduct?.stock).toBe(5);
    });
  });

  describe('dual-condition confirmation completes in either order (spec.md P1 "Cliente monta e confirma um pedido"/AC1, CAT-21)', () => {
    it('confirms and reserves stock when the operator approves AFTER the customer already confirmed', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId().toString();
      const product = await seedProduct(Tenant, { stock: 5 });
      const order = await seedOrder(Tenant, [
        { product: product._id, name: 'Produto Teste', unitPrice: 1000, quantity: 2 },
      ]);

      const afterCustomer = await setCustomerConfirmed(Tenant.toString(), order._id.toString(), [
        { productId: product._id.toString(), quantity: 2 },
      ]);
      expect((afterCustomer as OrderDocument).status).toBe('pending_approval');

      const afterOperator = await setOperatorApproved(Tenant.toString(), order._id.toString(), userId);

      expect(isError(afterOperator)).toBe(false);
      expect((afterOperator as OrderDocument).status).toBe('confirmed');
      const reloadedProduct = await Product.findById(product._id).lean();
      expect(reloadedProduct?.stock).toBe(3);
    });

    it('confirms and reserves stock when the customer confirms AFTER the operator already approved', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId().toString();
      const product = await seedProduct(Tenant, { stock: 5 });
      const order = await seedOrder(Tenant, [
        { product: product._id, name: 'Produto Teste', unitPrice: 1000, quantity: 2 },
      ]);

      const afterOperator = await setOperatorApproved(Tenant.toString(), order._id.toString(), userId);
      expect((afterOperator as OrderDocument).status).toBe('pending_approval');

      const afterCustomer = await setCustomerConfirmed(Tenant.toString(), order._id.toString(), [
        { productId: product._id.toString(), quantity: 2 },
      ]);

      expect(isError(afterCustomer)).toBe(false);
      expect((afterCustomer as OrderDocument).status).toBe('confirmed');
      const reloadedProduct = await Product.findById(product._id).lean();
      expect(reloadedProduct?.stock).toBe(3);
    });
  });

  describe('tryConfirmOrder — atomic all-or-nothing stock reservation (spec.md P1 "Operador aprova ou rejeita"/AC5, CAT-22)', () => {
    it('rolls back items already reserved in this attempt when a later item has insufficient stock, keeping pending_approval with confirmFailureReason', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId().toString();
      const productA = await seedProduct(Tenant, { name: 'Produto A', stock: 5 });
      const productB = await seedProduct(Tenant, { name: 'Produto B', stock: 1 });
      const order = await seedOrder(
        Tenant,
        [
          { product: productA._id, name: 'Produto A', unitPrice: 1000, quantity: 1 },
          { product: productB._id, name: 'Produto B', unitPrice: 2000, quantity: 5 },
        ],
        { customerConfirmed: true },
      );

      const result = await setOperatorApproved(Tenant.toString(), order._id.toString(), userId);

      expect(isError(result)).toBe(false);
      const updated = result as OrderDocument;
      expect(updated.status).toBe('pending_approval');
      expect(updated.confirmFailureReason).toBeTruthy();
      // CAT-22: nenhum decremento parcial sobrevive — Produto A, reservado
      // com sucesso NESTA tentativa antes de Produto B falhar, é desfeito de
      // volta ao valor original.
      const reloadedA = await Product.findById(productA._id).lean();
      const reloadedB = await Product.findById(productB._id).lean();
      expect(reloadedA?.stock).toBe(5);
      expect(reloadedB?.stock).toBe(1);
    });

    it('confirms all items atomically when every item has sufficient stock', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const productA = await seedProduct(Tenant, { name: 'Produto A', stock: 5 });
      const productB = await seedProduct(Tenant, { name: 'Produto B', stock: 5 });
      const order = await seedOrder(Tenant, [
        { product: productA._id, name: 'Produto A', unitPrice: 1000, quantity: 2 },
        { product: productB._id, name: 'Produto B', unitPrice: 2000, quantity: 3 },
      ]);

      const result = await tryConfirmOrder(Tenant.toString(), order._id.toString());

      expect(isError(result)).toBe(false);
      expect((result as OrderDocument).status).toBe('confirmed');
      const reloadedA = await Product.findById(productA._id).lean();
      const reloadedB = await Product.findById(productB._id).lean();
      expect(reloadedA?.stock).toBe(3);
      expect(reloadedB?.stock).toBe(2);
    });
  });

  describe('setCustomerConfirmed — divergent items rejected (spec.md P1 "Cliente monta e confirma um pedido"/AC4, CAT-15)', () => {
    it('rejects a 2nd-call items set that diverges from the stored Order, without mutating it', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const product = await seedProduct(Tenant, { stock: 5 });
      const order = await seedOrder(Tenant, [
        { product: product._id, name: 'Produto Teste', unitPrice: 1000, quantity: 2 },
      ]);

      const result = await setCustomerConfirmed(Tenant.toString(), order._id.toString(), [
        { productId: product._id.toString(), quantity: 3 },
      ]);

      expect(isError(result)).toBe(true);
      const reloaded = await Order.findById(order._id).lean();
      expect(reloaded?.customerConfirmed).toBe(false);
      expect(reloaded?.status).toBe('pending_approval');
    });
  });

  describe('no prior Order for the given id (spec.md P1 "Cliente monta e confirma um pedido"/AC5 analog, CAT-16)', () => {
    it('setCustomerConfirmed on a non-existent orderId returns {error}', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const result = await setCustomerConfirmed(Tenant.toString(), new mongoose.Types.ObjectId().toString(), []);
      expect(isError(result)).toBe(true);
    });

    it('setOperatorApproved on a non-existent orderId returns {error}', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const result = await setOperatorApproved(
        Tenant.toString(),
        new mongoose.Types.ObjectId().toString(),
        OPERATOR_USER_ID,
      );
      expect(isError(result)).toBe(true);
    });

    it('rejectOrder on a non-existent orderId returns {error}', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const result = await rejectOrder(Tenant.toString(), new mongoose.Types.ObjectId().toString(), OPERATOR_USER_ID);
      expect(isError(result)).toBe(true);
    });
  });

  describe('cross-tenant Order id is treated as not found (spec.md Edge Cases — defense in depth)', () => {
    it('returns {error} for an Order that belongs to a DIFFERENT tenant, leaving it untouched', async () => {
      const ownerTenant = new mongoose.Types.ObjectId();
      const intruderTenant = new mongoose.Types.ObjectId();
      const product = await seedProduct(ownerTenant, { stock: 5 });
      const order = await seedOrder(ownerTenant, [
        { product: product._id, name: 'Produto Teste', unitPrice: 1000, quantity: 2 },
      ]);

      const result = await setOperatorApproved(intruderTenant.toString(), order._id.toString(), OPERATOR_USER_ID);

      expect(isError(result)).toBe(true);
      const reloaded = await Order.findById(order._id).lean();
      expect(reloaded?.operatorApproved).toBe(false);
    });
  });

  describe('calls on an already terminal Order are a no-op (spec.md P1 "Operador aprova ou rejeita"/AC7, CAT-23/CAT-24)', () => {
    it('setOperatorApproved/setCustomerConfirmed/rejectOrder on a confirmed Order all return {error} without mutating it', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const product = await seedProduct(Tenant, { stock: 5 });
      const order = await seedOrder(
        Tenant,
        [{ product: product._id, name: 'Produto Teste', unitPrice: 1000, quantity: 2 }],
        { status: 'confirmed', customerConfirmed: true, operatorApproved: true },
      );

      const approveResult = await setOperatorApproved(Tenant.toString(), order._id.toString(), OPERATOR_USER_ID);
      const confirmResult = await setCustomerConfirmed(Tenant.toString(), order._id.toString(), [
        { productId: product._id.toString(), quantity: 2 },
      ]);
      const rejectResult = await rejectOrder(Tenant.toString(), order._id.toString(), OPERATOR_USER_ID);

      expect(isError(approveResult)).toBe(true);
      expect(isError(confirmResult)).toBe(true);
      expect(isError(rejectResult)).toBe(true);
      const reloaded = await Order.findById(order._id).lean();
      expect(reloaded?.status).toBe('confirmed');
      const reloadedProduct = await Product.findById(product._id).lean();
      expect(reloadedProduct?.stock).toBe(5);
    });

    it('setOperatorApproved/setCustomerConfirmed/rejectOrder on a rejected Order all return {error} without mutating it', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const product = await seedProduct(Tenant, { stock: 5 });
      const order = await seedOrder(
        Tenant,
        [{ product: product._id, name: 'Produto Teste', unitPrice: 1000, quantity: 2 }],
        { status: 'rejected', rejectionReason: 'motivo original' },
      );

      const approveResult = await setOperatorApproved(Tenant.toString(), order._id.toString(), OPERATOR_USER_ID);
      const confirmResult = await setCustomerConfirmed(Tenant.toString(), order._id.toString(), [
        { productId: product._id.toString(), quantity: 2 },
      ]);
      const rejectResult = await rejectOrder(Tenant.toString(), order._id.toString(), OPERATOR_USER_ID, 'motivo novo');

      expect(isError(approveResult)).toBe(true);
      expect(isError(confirmResult)).toBe(true);
      expect(isError(rejectResult)).toBe(true);
      const reloaded = await Order.findById(order._id).lean();
      expect(reloaded?.status).toBe('rejected');
      expect(reloaded?.rejectionReason).toBe('motivo original');
    });
  });

  describe('rejectOrder — terminal transition without touching stock (spec.md P1 "Operador aprova ou rejeita"/AC6, CAT-23)', () => {
    it('marks status:rejected, records rejectedBy/rejectionReason/rejectedAt, and never decrements stock', async () => {
      const Tenant = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId().toString();
      const product = await seedProduct(Tenant, { stock: 5 });
      const order = await seedOrder(Tenant, [
        { product: product._id, name: 'Produto Teste', unitPrice: 1000, quantity: 2 },
      ]);

      const result = await rejectOrder(Tenant.toString(), order._id.toString(), userId, 'cliente desistiu');

      expect(isError(result)).toBe(false);
      const updated = result as OrderDocument;
      expect(updated.status).toBe('rejected');
      expect(updated.rejectedBy?.toString()).toBe(userId);
      expect(updated.rejectionReason).toBe('cliente desistiu');
      expect(updated.rejectedAt).toBeInstanceOf(Date);
      const reloadedProduct = await Product.findById(product._id).lean();
      expect(reloadedProduct?.stock).toBe(5);
    });
  });
});
