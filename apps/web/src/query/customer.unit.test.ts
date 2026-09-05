import { describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
vi.mock('../lib/api/client.api.js', () => ({ get: getMock }));

const { customersQuery, customerQuery, customerKeys } = await import('./customer.js');

describe('customersQuery', () => {
  it('builds the querystring from page/limit/q/sort/order/status and calls GET /customers', async () => {
    getMock.mockResolvedValueOnce({ success: true, data: { items: [], total: 0 } });

    const params = { page: 2, limit: 10, q: 'ana', sort: 'name' as const, order: 'asc' as const, status: 'ativo' };
    await customersQuery(params).queryFn?.({} as never);

    expect(getMock).toHaveBeenCalledWith('/customers?page=2&limit=10&q=ana&sort=name&order=asc&status=ativo');
  });

  it('calls GET /customers with no querystring when no params are given', async () => {
    getMock.mockResolvedValueOnce({ success: true, data: { items: [], total: 0 } });

    await customersQuery().queryFn?.({} as never);

    expect(getMock).toHaveBeenCalledWith('/customers');
  });

  it('resolves with items/total on success', async () => {
    const data = { items: [{ id: '1', name: 'Ana' }], total: 1 };
    getMock.mockResolvedValueOnce({ success: true, data });

    const result = await customersQuery({ page: 1 }).queryFn?.({} as never);

    expect(result).toEqual(data);
  });

  it('throws with the backend message when success:false', async () => {
    getMock.mockResolvedValueOnce({ success: false, message: 'Falha ao listar.' });

    await expect(customersQuery({ page: 1 }).queryFn?.({} as never)).rejects.toThrow('Falha ao listar.');
  });

  it('exposes a queryKey that varies by params (so distinct pages/filters cache independently)', () => {
    expect(customersQuery({ page: 1 }).queryKey).toEqual(customerKeys.list({ page: 1 }));
    expect(customersQuery({ page: 1 }).queryKey).not.toEqual(customersQuery({ page: 2 }).queryKey);
  });
});

describe('customerQuery', () => {
  it('calls GET /customers/:id', async () => {
    getMock.mockResolvedValueOnce({ success: true, data: { id: 'c1', name: 'Ana' } });

    await customerQuery('c1').queryFn?.({} as never);

    expect(getMock).toHaveBeenCalledWith('/customers/c1');
  });

  it('resolves with the record on success', async () => {
    const data = { id: 'c1', name: 'Ana', phone: '11999999999', values: {} };
    getMock.mockResolvedValueOnce({ success: true, data });

    const result = await customerQuery('c1').queryFn?.({} as never);

    expect(result).toEqual(data);
  });

  it('throws with the backend message when the customer is not found', async () => {
    getMock.mockResolvedValueOnce({ success: false, message: 'Customer não encontrado' });

    await expect(customerQuery('missing').queryFn?.({} as never)).rejects.toThrow('Customer não encontrado');
  });

  it('exposes a queryKey scoped by id', () => {
    expect(customerQuery('c1').queryKey).toEqual(customerKeys.detail('c1'));
  });
});
