import { type FieldDef, NO_STATUS_FILTER_VALUE } from '@crm/contracts';
import { queryOptions } from '@tanstack/react-query';
import { get } from '../lib/api/client.api.js';
import { t } from '../lib/helpers/translate.helper.js';

// Espelha CustomerRecord de apps/crm-api/src/repositories/customer.repository.ts
// — a verdade fica no back-end; este tipo só descreve o que a tela consome
// (mesma convenção de SessionView em query/session.ts). Datas chegam como
// string ISO (JSON não serializa Date), nunca como Date de verdade.
export type CustomerRecord = {
  id: string;
  name: string;
  phone: string;
  document?: string;
  template: string;
  templateVersion: number;
  values: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CustomersQueryParams = {
  page?: number;
  limit?: number;
  q?: string;
  sort?: 'name' | 'createdAt';
  order?: 'asc' | 'desc';
  status?: string;
};

export type CustomersListResult = { items: CustomerRecord[]; total: number };

export const customerKeys = {
  all: ['customer'] as const,
  lists: () => [...customerKeys.all, 'list'] as const,
  list: (params: CustomersQueryParams) => [...customerKeys.lists(), params] as const,
  details: () => [...customerKeys.all, 'detail'] as const,
  detail: (id: string) => [...customerKeys.details(), id] as const,
};

const buildQueryString = (params: CustomersQueryParams): string => {
  const search = new URLSearchParams();
  if (params.page !== undefined) search.set('page', String(params.page));
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  if (params.q) search.set('q', params.q);
  if (params.sort) search.set('sort', params.sort);
  if (params.order) search.set('order', params.order);
  if (params.status !== undefined) search.set('status', params.status);
  const qs = search.toString();
  return qs ? `?${qs}` : '';
};

export const customersQuery = (params: CustomersQueryParams = {}) =>
  queryOptions({
    queryKey: customerKeys.list(params),
    queryFn: async (): Promise<CustomersListResult> => {
      const res = await get<CustomersListResult>(`/customers${buildQueryString(params)}`);
      if (!res.success || !res.data) throw new Error(res.message ?? 'Não foi possível carregar os clientes.');
      return res.data;
    },
  });

export const customerQuery = (id: string) =>
  queryOptions({
    queryKey: customerKeys.detail(id),
    queryFn: async (): Promise<CustomerRecord> => {
      const res = await get<CustomerRecord>(`/customers/${encodeURIComponent(id)}`);
      if (!res.success || !res.data) throw new Error(res.message ?? 'Customer não encontrado.');
      return res.data;
    },
  });

export type CustomerStatusColumn = { key: string; label: string; color?: string; order: number };

// WEB-02 AC1/AC4: coluna por opção do `status` corrente do template
// `customer`, ordenada por `StatusOption.order`, mais uma coluna final
// "sem status" (o sentinel NO_STATUS_FILTER_VALUE, `GET /customers`'s query
// extension de T4) — nunca omitida, mesmo quando o template não tem nenhum
// campo `status` definido. Função pura (não um hook): não depende de nenhum
// estado de React, só da lista de `fields` do template já carregado.
export const customerStatusColumns = (fields: FieldDef[]): CustomerStatusColumn[] => {
  const statusField = fields.find((field): field is Extract<FieldDef, { type: 'status' }> => field.type === 'status');
  const options = statusField ? [...statusField.options].sort((a, b) => a.order - b.order) : [];

  return [
    ...options.map((option) => ({ key: option.key, label: option.label, color: option.color, order: option.order })),
    { key: NO_STATUS_FILTER_VALUE, label: t('customer.status.none'), order: options.length },
  ];
};
