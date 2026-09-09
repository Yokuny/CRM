import type { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const postMock = vi.fn();
vi.mock('../lib/api/client.api.js', () => ({ get: getMock, post: postMock }));

const { ordersQuery, approveOrderMutation, rejectOrderMutation, orderKeys } = await import('./order.js');

const fakeQueryClient = (): QueryClient & { invalidateQueries: ReturnType<typeof vi.fn> } =>
  ({ invalidateQueries: vi.fn() }) as unknown as QueryClient & { invalidateQueries: ReturnType<typeof vi.fn> };

// TanStack Query 5.102's `MutationFunction` exige um 2º parâmetro de
// contexto que nenhuma `mutationFn` daqui realmente lê — mesmo workaround
// de query/product.unit.test.ts.
const fakeMutationContext = {} as never;

const ORDER_RECORD = {
  id: 'o1',
  conversation: 'c1',
  customer: 'cust1',
  customerName: 'Ana',
  items: [{ product: 'p1', name: 'Camiseta', unitPrice: 1000, quantity: 2 }],
  totalPrice: 2000,
  status: 'pending_approval' as const,
  idempotencyKey: 'k1',
  customerConfirmed: true,
  operatorApproved: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('ordersQuery (T22, spec.md P1 "Operador aprova ou rejeita um pedido pendente"/AC1)', () => {
  it('builds the querystring from status/conversation/page/limit and calls GET /orders', async () => {
    getMock.mockResolvedValueOnce({ success: true, data: { items: [], total: 0 } });

    const params = { status: 'pending_approval' as const, conversation: 'c1', page: 2, limit: 10 };
    await ordersQuery(params).queryFn?.({} as never);

    expect(getMock).toHaveBeenCalledWith('/orders?status=pending_approval&conversation=c1&page=2&limit=10');
  });

  it('calls GET /orders with no querystring when no params are given (server-driven, AD-028)', async () => {
    getMock.mockResolvedValueOnce({ success: true, data: { items: [], total: 0 } });

    await ordersQuery().queryFn?.({} as never);

    expect(getMock).toHaveBeenCalledWith('/orders');
  });

  it('resolves with items/total on success', async () => {
    const data = { items: [ORDER_RECORD], total: 1 };
    getMock.mockResolvedValueOnce({ success: true, data });

    const result = await ordersQuery({ status: 'pending_approval' }).queryFn?.({} as never);

    expect(result).toEqual(data);
  });

  it('throws with the backend message when success:false', async () => {
    getMock.mockResolvedValueOnce({ success: false, message: 'Falha ao listar pedidos.' });

    await expect(ordersQuery({ status: 'pending_approval' }).queryFn?.({} as never)).rejects.toThrow(
      'Falha ao listar pedidos.',
    );
  });

  it('exposes a queryKey that varies by params — the Pedidos screen (T23) and the Inbox card (T24) cache independently', () => {
    expect(ordersQuery({ status: 'pending_approval' }).queryKey).toEqual(orderKeys.list({ status: 'pending_approval' }));
    expect(ordersQuery({ status: 'pending_approval' }).queryKey).not.toEqual(
      ordersQuery({ conversation: 'c1', status: 'pending_approval' }).queryKey,
    );
  });
});

describe('approveOrderMutation (T22, spec.md P1 "Operador aprova ou rejeita"/AC4)', () => {
  it('calls POST /orders/:id/approve and resolves with the updated Order', async () => {
    postMock.mockResolvedValueOnce({ success: true, data: { ...ORDER_RECORD, status: 'confirmed' } });

    const result = await approveOrderMutation(fakeQueryClient()).mutationFn?.({ id: 'o1' }, fakeMutationContext);

    expect(postMock).toHaveBeenCalledWith('/orders/o1/approve');
    expect(result).toEqual({ ...ORDER_RECORD, status: 'confirmed' });
  });

  it('throws with the backend message when approval fails', async () => {
    postMock.mockResolvedValueOnce({ success: false, message: 'Order já está em estado terminal' });

    await expect(
      approveOrderMutation(fakeQueryClient()).mutationFn?.({ id: 'o1' }, fakeMutationContext),
    ).rejects.toThrow('Order já está em estado terminal');
  });

  it('invalidates every cached ordersQuery on success — both the Pedidos screen and the Inbox card share the orderKeys.lists() prefix', () => {
    const queryClient = fakeQueryClient();

    approveOrderMutation(queryClient).onSuccess?.(
      { ...ORDER_RECORD, status: 'confirmed' },
      { id: 'o1' },
      undefined,
      { client: queryClient } as never,
    );

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: orderKeys.lists() });
  });
});

describe('rejectOrderMutation (T22, spec.md P1 "Operador aprova ou rejeita"/AC6)', () => {
  it('calls POST /orders/:id/reject with the given reason and resolves with the updated Order', async () => {
    postMock.mockResolvedValueOnce({ success: true, data: { ...ORDER_RECORD, status: 'rejected' } });

    const result = await rejectOrderMutation(fakeQueryClient()).mutationFn?.(
      { id: 'o1', reason: 'cliente desistiu' },
      fakeMutationContext,
    );

    expect(postMock).toHaveBeenCalledWith('/orders/o1/reject', { reason: 'cliente desistiu' });
    expect(result).toEqual({ ...ORDER_RECORD, status: 'rejected' });
  });

  it('calls POST /orders/:id/reject with no reason when omitted (reason is optional, rejectOrderSchema)', async () => {
    postMock.mockResolvedValueOnce({ success: true, data: { ...ORDER_RECORD, status: 'rejected' } });

    await rejectOrderMutation(fakeQueryClient()).mutationFn?.({ id: 'o1' }, fakeMutationContext);

    expect(postMock).toHaveBeenCalledWith('/orders/o1/reject', { reason: undefined });
  });

  it('throws with the backend message when rejection fails', async () => {
    postMock.mockResolvedValueOnce({ success: false, message: 'Order já está em estado terminal' });

    await expect(
      rejectOrderMutation(fakeQueryClient()).mutationFn?.({ id: 'o1' }, fakeMutationContext),
    ).rejects.toThrow('Order já está em estado terminal');
  });

  it('invalidates every cached ordersQuery on success — same prefix as approveOrderMutation', () => {
    const queryClient = fakeQueryClient();

    rejectOrderMutation(queryClient).onSuccess?.(
      { ...ORDER_RECORD, status: 'rejected' },
      { id: 'o1' },
      undefined,
      { client: queryClient } as never,
    );

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: orderKeys.lists() });
  });
});
