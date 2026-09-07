import { FieldTemplate, FieldTemplateVersion, tenantScoped } from '@crm/db';
import type { JsonSchema } from '@crm/field-engine';
import { toToolSchema } from '@crm/field-engine';
import type { ToolContext } from './toolContext.js';

export type GetProcessTemplateInput = { key: string };
export type GetProcessTemplateResult = { fields: JsonSchema; stages: string[] } | { error: string };

// AIG-15: mesma forma de consulta de fieldTemplate.repository.findCurrentVersion
// (apps/crm-api) — replicada aqui (packages/ai-kit não importa de apps/*),
// sempre filtrando por ctx.tenantId (AD-010). Nunca lança: `key` inexistente
// ou template arquivado (AD-022, aplicado aqui do lado do consumidor) vira
// `{error}`.
export const getProcessTemplate = async (
  input: GetProcessTemplateInput,
  ctx: ToolContext,
): Promise<GetProcessTemplateResult> => {
  const template = await FieldTemplate.findOne(
    tenantScoped({ Tenant: ctx.tenantId, targetType: 'process' as const, key: input.key }),
  ).lean();
  if (!template || template.archived) return { error: 'Template de processo não encontrado' };

  const version = await FieldTemplateVersion.findOne(
    tenantScoped({ Tenant: ctx.tenantId, template: template._id.toString(), version: template.currentVersion }),
  ).lean();
  if (!version) return { error: 'Template de processo não encontrado' };

  return { fields: toToolSchema(version.fields), stages: version.stages ?? [] };
};
