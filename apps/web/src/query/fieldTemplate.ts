import type { FieldDef, FieldTemplateTargetType } from '@crm/contracts';
import { queryOptions } from '@tanstack/react-query';
import { get } from '../lib/api/client.api.js';

// Espelha CurrentTemplate de apps/crm-api/src/services/fieldTemplate.service.ts
// — mesma convenção de "espelho local" já usada em query/customer.ts
// (CustomerRecord) e query/session.ts (SessionView).
export type CurrentFieldTemplate = {
  template: { id: string; name: string; currentVersion: number; archived: boolean };
  fields: FieldDef[];
  stages?: string[];
};

export const fieldTemplateKeys = {
  all: ['fieldTemplate'] as const,
  current: (targetType: string, key: string) => [...fieldTemplateKeys.all, 'current', targetType, key] as const,
  lists: () => [...fieldTemplateKeys.all, 'list'] as const,
  list: (targetType: FieldTemplateTargetType) => [...fieldTemplateKeys.lists(), targetType] as const,
};

// WEB-07: descoberta de templates de Process disponíveis no tenant, para o
// picker de "novo Process" (T25) — `label`/`archived` já resolvidos pelo
// back-end (T5), o front-end só decide visibilidade/seleção do arquivado.
export type TemplateListItem = { key: string; label: string; archived: boolean };
export type TemplateListResult = { items: TemplateListItem[] };

export const fieldTemplatesQuery = (targetType: FieldTemplateTargetType) =>
  queryOptions({
    queryKey: fieldTemplateKeys.list(targetType),
    queryFn: async (): Promise<TemplateListResult> => {
      const res = await get<TemplateListResult>(`/field-templates?targetType=${encodeURIComponent(targetType)}`);
      if (!res.success || !res.data) throw new Error(res.message ?? 'Não foi possível carregar os templates.');
      return res.data;
    },
  });

// `key` é sempre a chave do template `customer` do tenant (um só por
// tenant, DEFAULT_CUSTOMER_TEMPLATE_KEY em field-engine/constants.ts) — o
// caller (T20/T22) resolve essa constante, este hook só monta a query.
export const currentCustomerTemplateQuery = (key: string) =>
  queryOptions({
    queryKey: fieldTemplateKeys.current('customer', key),
    queryFn: async (): Promise<CurrentFieldTemplate> => {
      const res = await get<CurrentFieldTemplate>(
        `/field-templates/current?targetType=customer&key=${encodeURIComponent(key)}`,
      );
      if (!res.success || !res.data) throw new Error(res.message ?? 'Template não encontrado.');
      return res.data;
    },
  });
