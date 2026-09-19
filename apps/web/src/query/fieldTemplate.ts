import type { BumpFieldTemplate, CreateFieldTemplate, FieldDef, FieldTemplateTargetType } from '@crm/contracts';
import { type QueryClient, queryOptions, type UseMutationOptions } from '@tanstack/react-query';
import { get, post } from '../lib/api/client.api.js';
import { t } from '../lib/helpers/translate.helper.js';

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
  versions: () => [...fieldTemplateKeys.all, 'version'] as const,
  version: (templateId: string, version: number) => [...fieldTemplateKeys.versions(), templateId, version] as const,
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
      if (!res.success || !res.data) throw new Error(res.message ?? t('load_error'));
      return res.data;
    },
  });

// WEB-08 (T25B backend, T26 front-end): fetch de UMA versão específica de um
// template — nunca a corrente (`GET /field-templates/current`), a versão
// EXATA que o registro (Process) aponta via seu próprio `(template,
// templateVersion)` snapshot (AD-023). `stages` fica opcional aqui pelo
// mesmo motivo de `CurrentFieldTemplate` (targetType `customer` nunca tem).
export type TemplateVersionSnapshot = { fields: FieldDef[]; stages?: string[] };

export const processTemplateVersionQuery = (templateId: string, version: number) =>
  queryOptions({
    queryKey: fieldTemplateKeys.version(templateId, version),
    queryFn: async (): Promise<TemplateVersionSnapshot> => {
      const res = await get<TemplateVersionSnapshot>(
        `/field-templates/${encodeURIComponent(templateId)}/versions/${version}`,
      );
      if (!res.success || !res.data) throw new Error(res.message ?? t('not_found'));
      return res.data;
    },
  });

// Versão corrente (id, versão, campos, etapas) de um template achado pelo par
// (targetType, key) — o único jeito de chegar no `id` que bump/archive
// exigem, já que a listagem (fieldTemplatesQuery) devolve só key/label.
export const currentFieldTemplateQuery = (targetType: FieldTemplateTargetType, key: string) =>
  queryOptions({
    queryKey: fieldTemplateKeys.current(targetType, key),
    queryFn: async (): Promise<CurrentFieldTemplate> => {
      const res = await get<CurrentFieldTemplate>(
        `/field-templates/current?targetType=${encodeURIComponent(targetType)}&key=${encodeURIComponent(key)}`,
      );
      if (!res.success || !res.data) throw new Error(res.message ?? t('not_found'));
      return res.data;
    },
  });

// `key` é sempre a chave do template `customer` do tenant (um só por
// tenant, DEFAULT_CUSTOMER_TEMPLATE_KEY em field-engine/constants.ts) — o
// caller (T20/T22) resolve essa constante, este hook só monta a query.
export const currentCustomerTemplateQuery = (key: string) => currentFieldTemplateQuery('customer', key);

// Criar/versionar/arquivar mexe em qualquer tela que leia templates (listas,
// formulários de cliente/processo) — invalida o prefixo inteiro.
const invalidateTemplates = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({ queryKey: fieldTemplateKeys.all });

// Só admin (POST /field-templates, isAdmin no back-end).
export const createFieldTemplateMutation = (
  queryClient: QueryClient,
): UseMutationOptions<{ id: string; currentVersion: number }, Error, CreateFieldTemplate> => ({
  mutationFn: async (data) => {
    const res = await post<{ id: string; currentVersion: number }>('/field-templates', data);
    if (!res.success || !res.data) throw new Error(res.message ?? t('create_error'));
    return res.data;
  },
  onSuccess: () => invalidateTemplates(queryClient),
});

// Nova versão dos campos/etapas (nunca edita a versão atual no lugar —
// `expectedVersion` é a trava otimista do back-end). Só admin.
export const bumpFieldTemplateMutation = (
  queryClient: QueryClient,
): UseMutationOptions<{ currentVersion: number }, Error, { id: string; data: BumpFieldTemplate }> => ({
  mutationFn: async ({ id, data }) => {
    const res = await post<{ currentVersion: number }>(`/field-templates/${encodeURIComponent(id)}/versions`, data);
    if (!res.success || !res.data) throw new Error(res.message ?? t('save_error'));
    return res.data;
  },
  onSuccess: () => invalidateTemplates(queryClient),
});

// Sem volta: não existe rota de desarquivar. Só admin.
export const archiveFieldTemplateMutation = (
  queryClient: QueryClient,
): UseMutationOptions<void, Error, { id: string }> => ({
  mutationFn: async ({ id }) => {
    const res = await post<never>(`/field-templates/${encodeURIComponent(id)}/archive`);
    if (!res.success) throw new Error(res.message ?? t('save_error'));
  },
  onSuccess: () => invalidateTemplates(queryClient),
});
