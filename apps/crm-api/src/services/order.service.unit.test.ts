import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderRecord } from '../repositories/order.repository.js';

const findByIdMock = vi.fn();
const listOrdersMock = vi.fn();
const setOperatorApprovedMock = vi.fn();
const rejectOrderTransitionMock = vi.fn();

vi.mock('../repositories/order.repository.js', () => ({
  findById: (...args: unknown[]) => findByIdMock(...args),
  listOrders: (...args: unknown[]) => listOrdersMock(...args),
}));

vi.mock('@crm/db', () => ({
  setOperatorApproved: (...args: unknown[]) => setOperatorApprovedMock(...args),
  rejectOrder: (...args: unknown[]) => rejectOrderTransitionMock(...args),
}));

const TENANT_ID = 'tenant-1';
const ORDER_ID = 'order-1';
const USER_ID = 'user-1';

const sampleRecord = (overrides: Partial<OrderRecord> = {}): OrderRecord => ({
  id: ORDER_ID,
  conversation: 'conversation-1',
  customer: 'customer-1',
  items: [{ product: 'product-1', name: 'Produto', unitPrice: 1000, quantity: 1 }],
  totalPrice: 1000,
  status: 'pending_approval',
  idempotencyKey: 'idem-1',
  customerConfirmed: false,
  operatorApproved: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

describe('order.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listOrders', () => {
    it('clamps an out-of-range page/limit before delegating to the repository (CORE-12 convention)', async () => {
      const { listOrders } = await import('./order.service.js');
      listOrdersMock.mockResolvedValueOnce({ items: [], total: 0 });

      await listOrders(TENANT_ID, { page: -5, limit: 99999 });

      expect(listOrdersMock).toHaveBeenCalledWith(TENANT_ID, {
        page: 1,
        limit: 100,
        status: undefined,
        conversation: undefined,
      });
    });

    it('passes status/conversation filters through untouched and returns the repository result', async () => {
      const { listOrders } = await import('./order.service.js');
      const repositoryResult = { items: [sampleRecord()], total: 1 };
      listOrdersMock.mockResolvedValueOnce(repositoryResult);

      const result = await listOrders(TENANT_ID, {
        page: 2,
        limit: 10,
        status: 'pending_approval',
        conversation: 'c1',
      });

      expect(listOrdersMock).toHaveBeenCalledWith(TENANT_ID, {
        page: 2,
        limit: 10,
        status: 'pending_approval',
        conversation: 'c1',
      });
      expect(result).toBe(repositoryResult);
    });
  });

  describe('approveOrder (spec.md AC4/AC5/AC7)', () => {
    it('throws OrderNotFoundError for a non-existent/other-tenant Order, without calling the transition', async () => {
      const { approveOrder, OrderNotFoundError } = await import('./order.service.js');
      findByIdMock.mockResolvedValueOnce(null);

      await expect(approveOrder(TENANT_ID, ORDER_ID, USER_ID)).rejects.toBeInstanceOf(OrderNotFoundError);
      expect(setOperatorApprovedMock).not.toHaveBeenCalled();
    });

    it('throws OrderAlreadyTerminalError for an already-confirmed Order, without calling the transition (spec.md AC7)', async () => {
      const { approveOrder, OrderAlreadyTerminalError } = await import('./order.service.js');
      findByIdMock.mockResolvedValueOnce(sampleRecord({ status: 'confirmed' }));

      await expect(approveOrder(TENANT_ID, ORDER_ID, USER_ID)).rejects.toBeInstanceOf(OrderAlreadyTerminalError);
      expect(setOperatorApprovedMock).not.toHaveBeenCalled();
    });

    it('throws OrderAlreadyTerminalError for an already-rejected Order, without calling the transition (spec.md AC7)', async () => {
      const { approveOrder, OrderAlreadyTerminalError } = await import('./order.service.js');
      findByIdMock.mockResolvedValueOnce(sampleRecord({ status: 'rejected' }));

      await expect(approveOrder(TENANT_ID, ORDER_ID, USER_ID)).rejects.toBeInstanceOf(OrderAlreadyTerminalError);
      expect(setOperatorApprovedMock).not.toHaveBeenCalled();
    });

    it('returns the current Order WITHOUT throwing when the atomic stock reservation fails (spec.md AC5/design.md Tech Decisions)', async () => {
      const { approveOrder } = await import('./order.service.js');
      findByIdMock.mockResolvedValueOnce(sampleRecord({ status: 'pending_approval' }));
      const stillPending = {
        status: 'pending_approval',
        confirmFailureReason: 'Estoque insuficiente para o produto "Produto"',
      };
      setOperatorApprovedMock.mockResolvedValueOnce(stillPending);

      const result = await approveOrder(TENANT_ID, ORDER_ID, USER_ID);

      expect(result).toBe(stillPending);
      expect((result as typeof stillPending).status).toBe('pending_approval');
      expect((result as typeof stillPending).confirmFailureReason).toBe(
        'Estoque insuficiente para o produto "Produto"',
      );
    });

    it('throws OrderAlreadyTerminalError when the transition itself returns {error} despite the pre-check (race window)', async () => {
      const { approveOrder, OrderAlreadyTerminalError } = await import('./order.service.js');
      findByIdMock.mockResolvedValueOnce(sampleRecord({ status: 'pending_approval' }));
      setOperatorApprovedMock.mockResolvedValueOnce({ error: 'Order já está em estado terminal' });

      await expect(approveOrder(TENANT_ID, ORDER_ID, USER_ID)).rejects.toBeInstanceOf(OrderAlreadyTerminalError);
    });
  });

  describe('rejectOrder (spec.md AC6/AC7)', () => {
    it('throws OrderNotFoundError for a non-existent/other-tenant Order, without calling the transition', async () => {
      const { rejectOrder, OrderNotFoundError } = await import('./order.service.js');
      findByIdMock.mockResolvedValueOnce(null);

      await expect(rejectOrder(TENANT_ID, ORDER_ID, USER_ID)).rejects.toBeInstanceOf(OrderNotFoundError);
      expect(rejectOrderTransitionMock).not.toHaveBeenCalled();
    });

    it('throws OrderAlreadyTerminalError for an already-terminal Order, without calling the transition (spec.md AC7)', async () => {
      const { rejectOrder, OrderAlreadyTerminalError } = await import('./order.service.js');
      findByIdMock.mockResolvedValueOnce(sampleRecord({ status: 'confirmed' }));

      await expect(rejectOrder(TENANT_ID, ORDER_ID, USER_ID)).rejects.toBeInstanceOf(OrderAlreadyTerminalError);
      expect(rejectOrderTransitionMock).not.toHaveBeenCalled();
    });

    it('marks the Order rejected with the given reason on success (spec.md AC6)', async () => {
      const { rejectOrder } = await import('./order.service.js');
      findByIdMock.mockResolvedValueOnce(sampleRecord({ status: 'pending_approval' }));
      const rejected = { status: 'rejected', rejectionReason: 'Fora de estoque' };
      rejectOrderTransitionMock.mockResolvedValueOnce(rejected);

      const result = await rejectOrder(TENANT_ID, ORDER_ID, USER_ID, 'Fora de estoque');

      expect(rejectOrderTransitionMock).toHaveBeenCalledWith(TENANT_ID, ORDER_ID, USER_ID, 'Fora de estoque');
      expect(result).toBe(rejected);
    });
  });
});
