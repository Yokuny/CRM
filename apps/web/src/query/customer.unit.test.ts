import type { FieldDef } from '@crm/contracts';
import { NO_STATUS_FILTER_VALUE } from '@crm/contracts';
import { describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
vi.mock('../lib/api/client.api.js', () => ({ get: getMock }));

const { customersQuery, customerQuery, customerKeys, customerStatusColumns } = await import('./customer.js');

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

describe('customerStatusColumns (T19 — WEB-02 AC1/AC4)', () => {
  const statusField: FieldDef = {
    fieldId: 'status',
    label: 'Status',
    type: 'status',
    options: [
      { key: 'closed', label: 'Fechado', color: '#ef4444', order: 1 },
      { key: 'open', label: 'Aberto', color: '#22c55e', order: 0 },
    ],
  };

  it('orders columns by StatusOption.order, then appends the "sem status" sentinel column last', () => {
    const columns = customerStatusColumns([statusField]);

    expect(columns).toEqual([
      { key: 'open', label: 'Aberto', color: '#22c55e', order: 0 },
      { key: 'closed', label: 'Fechado', color: '#ef4444', order: 1 },
      { key: NO_STATUS_FILTER_VALUE, label: 'Sem status', order: 2 },
    ]);
  });

  it('still includes the "sem status" sentinel column when the template has no `status` field at all', () => {
    const columns = customerStatusColumns([{ fieldId: 'name', label: 'Nome', type: 'text' }]);

    expect(columns).toEqual([{ key: NO_STATUS_FILTER_VALUE, label: 'Sem status', order: 0 }]);
  });

  it('the sentinel column value flows through customersQuery as an ordinary status filter (?status=__none__)', async () => {
    getMock.mockResolvedValueOnce({ success: true, data: { items: [], total: 0 } });

    await customersQuery({ status: NO_STATUS_FILTER_VALUE }).queryFn?.({} as never);

    expect(getMock).toHaveBeenCalledWith(`/customers?status=${NO_STATUS_FILTER_VALUE}`);
  });
});
