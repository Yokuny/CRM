import { FieldTemplateVersion, Process, tenantScoped } from '@crm/db';
import { validate } from '@crm/field-engine';
import type { ToolContext } from './toolContext.js';

export type SetProcessFieldsInput = { processId: string; values: Record<string, unknown> };
export type SetProcessFieldsResult = { ok: true } | { error: string; fieldErrors?: Record<string, string[]> };

// AIG-19: mesma sequência de apps/crm-api/src/services/process.service.ts#updateProcessValues
// (não importada — packages/ai-kit não importa de apps/*), agora com o Tenant vindo do
// ToolContext (AD-010). Valida contra a templateVersion DO PRÓPRIO Process — o snapshot
// gravado em Process.template/Process.templateVersion na criação (AD-023/CORE-08) — nunca
// a corrente do template, mesmo que ele já tenha avançado de versão depois.
export const setProcessFields = async (
  input: SetProcessFieldsInput,
  ctx: ToolContext,
): Promise<SetProcessFieldsResult> => {
  const process = await Process.findOne(tenantScoped({ Tenant: ctx.tenantId, _id: input.processId })).lean();
  if (!process) return { error: 'Processo não encontrado' };

  const version = await FieldTemplateVersion.findOne(
    tenantScoped({ Tenant: ctx.tenantId, template: process.template.toString(), version: process.templateVersion }),
  ).lean();
  if (!version) return { error: 'Versão de template do processo não encontrada' };

  const result = validate(version.fields, input.values);
  if (!result.valid) return { error: 'Valores inválidos', fieldErrors: result.errors };

  await Process.updateOne(
    tenantScoped({ Tenant: ctx.tenantId, _id: input.processId }),
    { $set: { values: input.values } },
  );

  return { ok: true };
};
