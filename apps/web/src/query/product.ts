import type { CreateProduct, UpdateProduct } from '@crm/contracts';
import type { QueryClient, UseMutationOptions } from '@tanstack/react-query';
import { queryOptions } from '@tanstack/react-query';
import { get, patch, post } from '../lib/api/client.api.js';

// Espelha ProductRecord de apps/crm-api/src/repositories/product.repository.ts
// — a verdade fica no back-end; este tipo só descreve o que a tela consome
// (mesma convenção de "espelho local" já usada em query/customer.ts,
// CustomerRecord). Datas chegam como string ISO (JSON não serializa Date),
// nunca como Date de verdade.
export type ProductRecord = {
  id: string;
  name: string;
  sku?: string;
  description?: string;
  price: number;
  stock: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProductsQueryParams = {
  page?: number;
  limit?: number;
  name?: string;
  active?: boolean;
};

export type ProductsListResult = { items: ProductRecord[]; total: number };

export const productKeys = {
  all: ['product'] as const,
  lists: () => [...productKeys.all, 'list'] as const,
  list: (params: ProductsQueryParams) => [...productKeys.lists(), params] as const,
};

const buildQueryString = (params: ProductsQueryParams): string => {
  const search = new URLSearchParams();
  if (params.page !== undefined) search.set('page', String(params.page));
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  if (params.name) search.set('name', params.name);
  if (params.active !== undefined) search.set('active', String(params.active));
  const qs = search.toString();
  return qs ? `?${qs}` : '';
};

// spec.md P1 "Cadastro de catálogo"/AC2: listagem paginada, filtro opcional
// por name/active — todo o estado de página/filtro vem de `params` (AD-028,
// server-driven), nunca slice/filter em memória. Mesmo molde de
// query/customer.ts (customersQuery).
export const productsQuery = (params: ProductsQueryParams = {}) =>
  queryOptions({
    queryKey: productKeys.list(params),
    queryFn: async (): Promise<ProductsListResult> => {
      const res = await get<ProductsListResult>(`/products${buildQueryString(params)}`);
      if (!res.success || !res.data) throw new Error(res.message ?? 'Não foi possível carregar os produtos.');
      return res.data;
    },
  });

// spec.md P1 "Cadastro de catálogo"/AC1: cria um Product. `queryClient` é
// injetado (não um hook próprio) pra manter esta função testável isolada de
// React — quem chama (a rota) passa o `useQueryClient()` do próprio
// componente. Invalida TODA lista já cacheada (qualquer combinação de
// filtro/página) no sucesso, pra próxima leitura refletir o novo registro.
export const createProductMutation = (
  queryClient: QueryClient,
): UseMutationOptions<ProductRecord, Error, CreateProduct> => ({
  mutationFn: async (data) => {
    const res = await post<ProductRecord>('/products', data);
    if (!res.success || !res.data) throw new Error(res.message ?? 'Não foi possível criar o produto.');
    return res.data;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: productKeys.lists() });
  },
});

// spec.md P1 "Cadastro de catálogo"/AC3: atualiza os campos informados de um
// Product existente (inclusive stock/active) — mesma invalidação de
// createProductMutation no sucesso.
export const updateProductMutation = (
  queryClient: QueryClient,
): UseMutationOptions<ProductRecord, Error, { id: string; data: UpdateProduct }> => ({
  mutationFn: async ({ id, data }) => {
    const res = await patch<ProductRecord>(`/products/${encodeURIComponent(id)}`, data);
    if (!res.success || !res.data) throw new Error(res.message ?? 'Não foi possível atualizar o produto.');
    return res.data;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: productKeys.lists() });
  },
});
