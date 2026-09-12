import type { CreateSpace, UpdateSpace } from '@crm/contracts';
import type { QueryClient, UseMutationOptions } from '@tanstack/react-query';
import { queryOptions } from '@tanstack/react-query';
import { get, patch, post } from '../lib/api/client.api.js';

// Espelha SpaceRecord de apps/crm-api/src/repositories/space.repository.ts —
// a verdade fica no back-end; este tipo só descreve o que a tela consome
// (mesma convenção de "espelho local" já usada em query/professional.ts,
// ProfessionalRecord). Datas chegam como string ISO (JSON não serializa
// Date), nunca como Date de verdade.
export type SpaceRecord = {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SpacesQueryParams = { page?: number; limit?: number; active?: boolean };

export type SpacesListResult = { items: SpaceRecord[]; total: number };

export const spaceKeys = {
  all: ['space'] as const,
  lists: () => [...spaceKeys.all, 'list'] as const,
  list: (params: SpacesQueryParams) => [...spaceKeys.lists(), params] as const,
  details: () => [...spaceKeys.all, 'detail'] as const,
  detail: (id: string) => [...spaceKeys.details(), id] as const,
};

const buildQueryString = (params: SpacesQueryParams): string => {
  const search = new URLSearchParams();
  if (params.page !== undefined) search.set('page', String(params.page));
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  if (params.active !== undefined) search.set('active', String(params.active));
  const qs = search.toString();
  return qs ? `?${qs}` : '';
};

// spec.md SCH-04/SCH-08: listagem paginada, filtro opcional por active —
// todo o estado de página/filtro vem de `params` (AD-028, server-driven),
// nunca slice/filter em memória. Mesmo molde de query/professional.ts
// (professionalsQuery).
export const spacesQuery = (params: SpacesQueryParams = {}) =>
  queryOptions({
    queryKey: spaceKeys.list(params),
    queryFn: async (): Promise<SpacesListResult> => {
      const res = await get<SpacesListResult>(`/spaces${buildQueryString(params)}`);
      if (!res.success || !res.data) throw new Error(res.message ?? 'Não foi possível carregar os ambientes.');
      return res.data;
    },
  });

// GET /spaces/:id é uma rota real (Batch 3/T17) — mesmo molde de
// professionalQuery.
export const spaceQuery = (id: string) =>
  queryOptions({
    queryKey: spaceKeys.detail(id),
    queryFn: async (): Promise<SpaceRecord> => {
      const res = await get<SpaceRecord>(`/spaces/${encodeURIComponent(id)}`);
      if (!res.success || !res.data) throw new Error(res.message ?? 'Ambiente não encontrado.');
      return res.data;
    },
  });

// spec.md SCH-04: cria um Space. Invalida TODA lista já cacheada no
// sucesso, mesmo padrão de createProfessionalMutation.
export const createSpaceMutation = (queryClient: QueryClient): UseMutationOptions<SpaceRecord, Error, CreateSpace> => ({
  mutationFn: async (data) => {
    const res = await post<SpaceRecord>('/spaces', data);
    if (!res.success || !res.data) throw new Error(res.message ?? 'Não foi possível criar o ambiente.');
    return res.data;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: spaceKeys.lists() });
  },
});

// spec.md SCH-04: atualiza os campos informados de um Space existente
// (inclusive `active`). Invalida a lista E o detalhe deste id no sucesso —
// mesmo padrão de updateProfessionalMutation.
export const updateSpaceMutation = (
  queryClient: QueryClient,
): UseMutationOptions<SpaceRecord, Error, { id: string; data: UpdateSpace }> => ({
  mutationFn: async ({ id, data }) => {
    const res = await patch<SpaceRecord>(`/spaces/${encodeURIComponent(id)}`, data);
    if (!res.success || !res.data) throw new Error(res.message ?? 'Não foi possível atualizar o ambiente.');
    return res.data;
  },
  onSuccess: (_updated, variables) => {
    queryClient.invalidateQueries({ queryKey: spaceKeys.lists() });
    queryClient.invalidateQueries({ queryKey: spaceKeys.detail(variables.id) });
  },
});
