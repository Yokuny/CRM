import { Customer, FieldTemplate, FieldTemplateVersion, Process, tenantScoped } from '@crm/db';
import type { ToolContext } from './toolContext.js';

export type OpenProcessInput = { templateKey: string; customerId: string; values?: Record<string, unknown> };
export type OpenProcessResult = { processId: string; stage: string } | { error: string };

// AIG-17/18: mesma sequência de apps/crm-api/src/services/process.service.ts#createProcess
// (não importada — packages/ai-kit não importa de apps/*), agora com o Tenant vindo do
// ToolContext (AD-010) em vez de uma rota autenticada. `customerId` de outro tenant (ou
// inexistente) nunca resolve pela query tenantScoped — devolve {error}, nenhum Process
// criado (mesma garantia CORE-10). `stage` inicial = stages[0] da FieldTemplateVersion
// corrente do template (AD-023: snapshot gravado no Process, nunca re-resolvido depois).
export const openProcess = async (input: OpenProcessInput, ctx: ToolContext): Promise<OpenProcessResult> => {
  const template = await FieldTemplate.findOne(
    tenantScoped({ Tenant: ctx.tenantId, targetType: 'process' as const, key: input.templateKey }),
  ).lean();
  if (!template || template.archived) return { error: 'Template de processo não encontrado' };

  const customer = await Customer.findOne(tenantScoped({ Tenant: ctx.tenantId, _id: input.customerId })).lean();
  if (!customer) return { error: 'Cliente não encontrado' };

  const version = await FieldTemplateVersion.findOne(
    tenantScoped({ Tenant: ctx.tenantId, template: template._id.toString(), version: template.currentVersion }),
  ).lean();
  const firstStage = version?.stages?.[0];
  if (!firstStage) return { error: 'Template de processo não encontrado' };

  const created = await Process.create({
    Tenant: ctx.tenantId,
    customer: customer._id,
    template: template._id,
    templateVersion: template.currentVersion,
    stage: firstStage,
    values: input.values ?? {},
  });

  return { processId: created._id.toString(), stage: created.stage };
};
