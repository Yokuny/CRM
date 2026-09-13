import type { UpdateSchedulingSettings } from '@crm/contracts';
import type { SchedulingSettingsRecord } from '../repositories/schedulingSettings.repository.js';
import * as schedulingSettingsRepository from '../repositories/schedulingSettings.repository.js';

// spec.md SCH-06: "quando o tenant nunca configurou, o valor SHALL ser 16" —
// mesmo valor default do model (schedulingSettings.model.ts), repetido aqui
// porque "não configurado ainda" é um estado válido e comum, nunca um 404.
export const DEFAULT_MAX_SLOTS_PER_RESPONSE = 16;

export type SchedulingSettingsView = SchedulingSettingsRecord | { maxSlotsPerResponse: number };

export const getSchedulingSettings = async (tenantId: string): Promise<SchedulingSettingsView> => {
  const existing = await schedulingSettingsRepository.getByTenant(tenantId);
  return existing ?? { maxSlotsPerResponse: DEFAULT_MAX_SLOTS_PER_RESPONSE };
};

// updateSchedulingSettingsSchema (contracts, T11) já cobre integralmente a
// faixa 1..50 de SCH-06 — sem gap para o service fechar aqui, mesmo
// raciocínio de professional.service.ts/space.service.ts. upsert (T18) cria
// o documento do Tenant na primeira chamada e atualiza o mesmo documento nas
// seguintes, então não há um caminho "não encontrado" para este PUT.
export const updateSchedulingSettings = async (
  tenantId: string,
  data: UpdateSchedulingSettings,
): Promise<SchedulingSettingsRecord> =>
  schedulingSettingsRepository.upsert(tenantId, { maxSlotsPerResponse: data.maxSlotsPerResponse });
