import type { UpdateSchedulingSettings } from '@crm/contracts';
import type { QueryClient, UseMutationOptions } from '@tanstack/react-query';
import { queryOptions } from '@tanstack/react-query';
import { get, put } from '../lib/api/client.api.js';

// Espelha SchedulingSettingsView de
// apps/crm-api/src/services/schedulingSettings.service.ts — um único
// documento por Tenant, sem lista/id (diferente de query/professional.ts/
// query/space.ts). `maxSlotsPerResponse` é o único campo que a tela
// consome — `GET /scheduling-settings` devolve `{maxSlotsPerResponse: 16}`
// quando o tenant nunca configurou (default do próprio service, spec.md
// SCH-06), nunca um 404.
export type SchedulingSettingsRecord = { maxSlotsPerResponse: number };

// Sem lista/params (documento único por Tenant) — só uma chave de detalhe,
// mesmo raciocínio de query/professional.ts's professionalKeys.detail, mas
// sem id porque só existe UM documento por Tenant.
export const schedulingSettingsKeys = {
  all: ['schedulingSettings'] as const,
  detail: () => [...schedulingSettingsKeys.all, 'detail'] as const,
};

// spec.md SCH-06/SCH-08: GET /scheduling-settings.
export const schedulingSettingsQuery = () =>
  queryOptions({
    queryKey: schedulingSettingsKeys.detail(),
    queryFn: async (): Promise<SchedulingSettingsRecord> => {
      const res = await get<SchedulingSettingsRecord>('/scheduling-settings');
      if (!res.success || !res.data) throw new Error(res.message ?? 'Não foi possível carregar a configuração da agenda.');
      return res.data;
    },
  });

// spec.md SCH-06: PUT /scheduling-settings (upsert no back-end — cria na
// primeira chamada, atualiza o mesmo documento nas seguintes). Invalida a
// única chave de detalhe no sucesso.
export const updateSchedulingSettingsMutation = (
  queryClient: QueryClient,
): UseMutationOptions<SchedulingSettingsRecord, Error, UpdateSchedulingSettings> => ({
  mutationFn: async (data) => {
    const res = await put<SchedulingSettingsRecord>('/scheduling-settings', data);
    if (!res.success || !res.data) throw new Error(res.message ?? 'Não foi possível salvar a configuração da agenda.');
    return res.data;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: schedulingSettingsKeys.detail() });
  },
});
