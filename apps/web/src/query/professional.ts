import type { CreateProfessional, UpdateProfessional } from '@crm/contracts';
import type { QueryClient, UseMutationOptions } from '@tanstack/react-query';
import { queryOptions } from '@tanstack/react-query';
import { get, patch, post } from '../lib/api/client.api.js';

// Espelha ProfessionalRecord de
// apps/crm-api/src/repositories/professional.repository.ts — a verdade fica
// no back-end; este tipo só descreve o que a tela consome (mesma convenção
// de "espelho local" já usada em query/product.ts, ProductRecord). Datas
// chegam como string ISO (JSON não serializa Date), nunca como Date de
// verdade.
export type ScheduleWindowRecord = { weekday: number; start: string; end: string };

export type ProfessionalRecord = {
  id: string;
  name: string;
  slotDurationMinutes: number;
  weeklySchedule: ScheduleWindowRecord[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProfessionalsQueryParams = { page?: number; limit?: number; active?: boolean };

export type ProfessionalsListResult = { items: ProfessionalRecord[]; total: number };

export const professionalKeys = {
  all: ['professional'] as const,
  lists: () => [...professionalKeys.all, 'list'] as const,
  list: (params: ProfessionalsQueryParams) => [...professionalKeys.lists(), params] as const,
  details: () => [...professionalKeys.all, 'detail'] as const,
  detail: (id: string) => [...professionalKeys.details(), id] as const,
};

const buildQueryString = (params: ProfessionalsQueryParams): string => {
  const search = new URLSearchParams();
  if (params.page !== undefined) search.set('page', String(params.page));
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  if (params.active !== undefined) search.set('active', String(params.active));
  const qs = search.toString();
  return qs ? `?${qs}` : '';
};

// spec.md SCH-01/SCH-08: listagem paginada, filtro opcional por active — todo
// o estado de página/filtro vem de `params` (AD-028, server-driven), nunca
// slice/filter em memória. Mesmo molde de query/product.ts (productsQuery).
export const professionalsQuery = (params: ProfessionalsQueryParams = {}) =>
  queryOptions({
    queryKey: professionalKeys.list(params),
    queryFn: async (): Promise<ProfessionalsListResult> => {
      const res = await get<ProfessionalsListResult>(`/professionals${buildQueryString(params)}`);
      if (!res.success || !res.data) throw new Error(res.message ?? 'Não foi possível carregar os profissionais.');
      return res.data;
    },
  });

// GET /professionals/:id é uma rota real (Batch 3/T15) — diferente de
// query/product.ts (sem GET /products/:id), este espelha query/customer.ts
// (customerQuery).
export const professionalQuery = (id: string) =>
  queryOptions({
    queryKey: professionalKeys.detail(id),
    queryFn: async (): Promise<ProfessionalRecord> => {
      const res = await get<ProfessionalRecord>(`/professionals/${encodeURIComponent(id)}`);
      if (!res.success || !res.data) throw new Error(res.message ?? 'Profissional não encontrado.');
      return res.data;
    },
  });

// spec.md SCH-01: cria um Professional (`weeklySchedule` já validado por
// createProfessionalSchema, T10). Invalida TODA lista já cacheada no
// sucesso, mesmo padrão de createProductMutation.
export const createProfessionalMutation = (
  queryClient: QueryClient,
): UseMutationOptions<ProfessionalRecord, Error, CreateProfessional> => ({
  mutationFn: async (data) => {
    const res = await post<ProfessionalRecord>('/professionals', data);
    if (!res.success || !res.data) throw new Error(res.message ?? 'Não foi possível criar o profissional.');
    return res.data;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: professionalKeys.lists() });
  },
});

// spec.md SCH-05: atualiza os campos informados de um Professional existente
// (inclusive `active`, sem apagar histórico). Invalida a lista E o detalhe
// deste id no sucesso — diferente de updateProductMutation (Product não tem
// query de detalhe própria).
export const updateProfessionalMutation = (
  queryClient: QueryClient,
): UseMutationOptions<ProfessionalRecord, Error, { id: string; data: UpdateProfessional }> => ({
  mutationFn: async ({ id, data }) => {
    const res = await patch<ProfessionalRecord>(`/professionals/${encodeURIComponent(id)}`, data);
    if (!res.success || !res.data) throw new Error(res.message ?? 'Não foi possível atualizar o profissional.');
    return res.data;
  },
  onSuccess: (_updated, variables) => {
    queryClient.invalidateQueries({ queryKey: professionalKeys.lists() });
    queryClient.invalidateQueries({ queryKey: professionalKeys.detail(variables.id) });
  },
});
