import type { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const postMock = vi.fn();
const patchMock = vi.fn();
vi.mock('../lib/api/client.api.js', () => ({ get: getMock, post: postMock, patch: patchMock }));

const { productsQuery, createProductMutation, updateProductMutation, productKeys } = await import('./product.js');

const fakeQueryClient = (): QueryClient & { invalidateQueries: ReturnType<typeof vi.fn> } =>
  ({ invalidateQueries: vi.fn() }) as unknown as QueryClient & { invalidateQueries: ReturnType<typeof vi.fn> };

// TanStack Query 5.102's `MutationFunction` exige um 2º parâmetro de
// contexto (`{client, meta, mutationKey}`) que nenhuma `mutationFn` daqui
// realmente lê — um valor qualquer satisfaz a assinatura nos testes.
const fakeMutationContext = {} as never;

describe('productsQuery (T18, spec.md P1 "Cadastro de catálogo"/AC2)', () => {
  it('builds the querystring from page/limit/name/active and calls GET /products', async () => {
    getMock.mockResolvedValueOnce({ success: true, data: { items: [], total: 0 } });

    const params = { page: 2, limit: 10, name: 'camiseta', active: true };
    await productsQuery(params).queryFn?.({} as never);

    expect(getMock).toHaveBeenCalledWith('/products?page=2&limit=10&name=camiseta&active=true');
  });

  it('calls GET /products with no querystring when no params are given (server-driven default page, AD-028)', async () => {
    getMock.mockResolvedValueOnce({ success: true, data: { items: [], total: 0 } });

    await productsQuery().queryFn?.({} as never);

    expect(getMock).toHaveBeenCalledWith('/products');
  });

  it('resolves with items/total on success', async () => {
    const data = { items: [{ id: 'p1', name: 'Camiseta', price: 1000, stock: 5, active: true }], total: 1 };
    getMock.mockResolvedValueOnce({ success: true, data });

    const result = await productsQuery({ page: 1 }).queryFn?.({} as never);

    expect(result).toEqual(data);
  });

  it('throws with the backend message when success:false', async () => {
    getMock.mockResolvedValueOnce({ success: false, message: 'Falha ao listar produtos.' });

    await expect(productsQuery({ page: 1 }).queryFn?.({} as never)).rejects.toThrow('Falha ao listar produtos.');
  });

  it('exposes a queryKey that varies by params (so distinct pages/filters cache independently)', () => {
    expect(productsQuery({ page: 1 }).queryKey).toEqual(productKeys.list({ page: 1 }));
    expect(productsQuery({ page: 1 }).queryKey).not.toEqual(productsQuery({ page: 2 }).queryKey);
  });
});

describe('createProductMutation (T18, spec.md P1 "Cadastro de catálogo"/AC1)', () => {
  it('calls POST /products with the given input and resolves with the created record', async () => {
    const created = { id: 'p1', name: 'Camiseta', price: 1000, stock: 5, active: true };
    postMock.mockResolvedValueOnce({ success: true, data: created });
    const input = { name: 'Camiseta', price: 1000, stock: 5 };

    const result = await createProductMutation(fakeQueryClient()).mutationFn?.(input, fakeMutationContext);

    expect(postMock).toHaveBeenCalledWith('/products', input);
    expect(result).toEqual(created);
  });

  it('throws with the backend message when creation fails', async () => {
    postMock.mockResolvedValueOnce({ success: false, message: 'name é obrigatório' });

    await expect(
      createProductMutation(fakeQueryClient()).mutationFn?.({ name: '', price: 0, stock: 0 }, fakeMutationContext),
    ).rejects.toThrow('name é obrigatório');
  });

  it('invalidates every cached productsQuery list on success (Done when: "Mutations invalidam productsQuery no sucesso")', () => {
    const queryClient = fakeQueryClient();

    createProductMutation(queryClient).onSuccess?.(
      { id: 'p1', name: 'Camiseta', price: 1000, stock: 5, active: true, createdAt: '', updatedAt: '' },
      { name: 'Camiseta', price: 1000, stock: 5 },
      undefined,
      { client: queryClient } as never,
    );

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: productKeys.lists() });
  });
});

describe('updateProductMutation (T18, spec.md P1 "Cadastro de catálogo"/AC3)', () => {
  it('calls PATCH /products/:id with the given data and resolves with the updated record', async () => {
    const updated = { id: 'p1', name: 'Camiseta', price: 1000, stock: 3, active: false };
    patchMock.mockResolvedValueOnce({ success: true, data: updated });

    const result = await updateProductMutation(fakeQueryClient()).mutationFn?.(
      { id: 'p1', data: { stock: 3, active: false } },
      fakeMutationContext,
    );

    expect(patchMock).toHaveBeenCalledWith('/products/p1', { stock: 3, active: false });
    expect(result).toEqual(updated);
  });

  it('throws with the backend message when the update fails', async () => {
    patchMock.mockResolvedValueOnce({ success: false, message: 'Produto não encontrado' });

    await expect(
      updateProductMutation(fakeQueryClient()).mutationFn?.({ id: 'missing', data: { stock: 1 } }, fakeMutationContext),
    ).rejects.toThrow('Produto não encontrado');
  });

  it('invalidates every cached productsQuery list on success (Done when: "Mutations invalidam productsQuery no sucesso")', () => {
    const queryClient = fakeQueryClient();

    updateProductMutation(queryClient).onSuccess?.(
      { id: 'p1', name: 'Camiseta', price: 1000, stock: 3, active: false, createdAt: '', updatedAt: '' },
      { id: 'p1', data: { stock: 3 } },
      undefined,
      { client: queryClient } as never,
    );

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: productKeys.lists() });
  });
});
