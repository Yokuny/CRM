import { queryOptions } from '@tanstack/react-query';
import { get } from '../lib/api/client.api.js';

// Espelha ProcessRecord de apps/crm-api/src/repositories/process.repository.ts
// — mesma convenção de "espelho local" já usada em query/customer.ts
// (CustomerRecord). Datas chegam como string ISO (JSON não serializa Date),
// nunca como Date de verdade.
export type ProcessRecord = {
  id: string;
  customer: string;
  template: string;
  templateVersion: number;
  stage: string;
  values: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ProcessesListResult = { items: ProcessRecord[] };

export const processKeys = {
  all: ['process'] as const,
  lists: () => [...processKeys.all, 'list'] as const,
  list: (customerId: string) => [...processKeys.lists(), customerId] as const,
};

// Não há GET /processes/:id (confirmado lendo process.router.ts) — toda tela
// que precisa de UM Process (T26/T27) resolve o registro filtrando `items`
// desta mesma lista pelo `id` do search param, nunca uma segunda rota. A
// lista em si não é paginada (design.md) — sem `total`.
export const processesQuery = (customerId: string) =>
  queryOptions({
    queryKey: processKeys.list(customerId),
    queryFn: async (): Promise<ProcessesListResult> => {
      const res = await get<ProcessesListResult>(`/processes?customerId=${encodeURIComponent(customerId)}`);
      if (!res.success || !res.data) throw new Error(res.message ?? 'Não foi possível carregar os processos.');
      return res.data;
    },
  });
