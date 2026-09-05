import type { CreateProcess } from '@crm/contracts';
import { validate } from '@crm/field-engine';
import { CustomError } from '../middlewares/errorHandler.middleware.js';
import * as customerRepository from '../repositories/customer.repository.js';
import * as fieldTemplateRepository from '../repositories/fieldTemplate.repository.js';
import type { ProcessRecord } from '../repositories/process.repository.js';
import * as processRepository from '../repositories/process.repository.js';

// Mesma convenção de customer.service.ts para condensar erros de campo num
// único CustomError.message legível (badRespObj só carrega `message`).
const formatValidationErrors = (errors: Record<string, string[]>): string =>
  Object.entries(errors)
    .map(([field, messages]) => `${field}: ${messages.join(', ')}`)
    .join('; ');

// CORE-07/10/12/13: resolve o template `process` pelo `templateKey` escolhido,
// recusa template arquivado (AD-022), garante que o Customer pertence ao
// MESMO Tenant (customer.repository.findById — id forjado/estrangeiro resolve
// a null, 404, CORE-10) e valida `values` (default `{}`) contra o field-engine
// ANTES de qualquer escrita. `stage` nasce em `stages[0]` da templateVersion
// resolvida, persistida como snapshot permanente (nunca re-resolvida depois).
export const createProcess = async (tenantId: string, data: CreateProcess): Promise<ProcessRecord> => {
  const template = await fieldTemplateRepository.findTemplateByTargetKey(tenantId, 'process', data.templateKey);
  if (!template) throw new CustomError('Template de processo não encontrado', 404);
  if (template.archived) throw new CustomError('Template arquivado', 400);

  const customer = await customerRepository.findById(tenantId, data.customerId);
  if (!customer) throw new CustomError('Cliente não encontrado', 404);

  const version = await fieldTemplateRepository.findCurrentVersion(tenantId, template.id, template.currentVersion);
  if (!version) throw new CustomError('Template de processo não encontrado', 404);

  const firstStage = version.stages?.[0];
  if (!firstStage) throw new CustomError('Template de processo sem stages configuradas', 400);

  const values = data.values ?? {};
  const result = validate(version.fields, values);
  if (!result.valid) throw new CustomError(formatValidationErrors(result.errors), 400);

  return processRepository.createProcess({
    tenant: tenantId,
    customer: customer.id,
    template: template.id,
    templateVersion: template.currentVersion,
    stage: firstStage,
    values,
  });
};

// CORE-08: valida contra a `templateVersion` que O PRÓPRIO Process usa — nunca
// a corrente do template. `findCurrentVersion` só resolve o par
// (template,version) informado, não "a versão mais nova do template", então
// passar `process.templateVersion` (o snapshot gravado na criação) é o que
// garante isso, mesmo que o template já tenha avançado depois.
export const updateProcessValues = async (
  tenantId: string,
  id: string,
  values: Record<string, unknown>,
): Promise<ProcessRecord> => {
  const process = await processRepository.findById(tenantId, id);
  if (!process) throw new CustomError('Processo não encontrado', 404);

  const version = await fieldTemplateRepository.findCurrentVersion(tenantId, process.template, process.templateVersion);
  if (!version) throw new CustomError('Versão de template do processo não encontrada', 404);

  const result = validate(version.fields, values);
  if (!result.valid) throw new CustomError(formatValidationErrors(result.errors), 400);

  const updated = await processRepository.updateValues(tenantId, id, values);
  if (!updated) throw new CustomError('Processo não encontrado', 404);
  return updated;
};

// CORE-09/17: `stage` só transiciona para um valor MEMBRO dos `stages` da
// snapshot do próprio Process (mesmo par template/templateVersion de
// updateProcessValues) — a guarda roda antes de qualquer escrita.
export const updateProcessStage = async (tenantId: string, id: string, stage: string): Promise<ProcessRecord> => {
  const process = await processRepository.findById(tenantId, id);
  if (!process) throw new CustomError('Processo não encontrado', 404);

  const version = await fieldTemplateRepository.findCurrentVersion(tenantId, process.template, process.templateVersion);
  if (!version) throw new CustomError('Versão de template do processo não encontrada', 404);

  if (!version.stages?.includes(stage)) {
    throw new CustomError('stage inválido para este template', 400);
  }

  const updated = await processRepository.updateStage(tenantId, id, stage);
  if (!updated) throw new CustomError('Processo não encontrado', 404);
  return updated;
};

// P2/CORE-11: um customerId de outro tenant (ou sem nenhum Process ainda)
// simplesmente não casa nada no repositório — lista vazia, não erro.
export const listProcessesByCustomer = async (tenantId: string, customerId: string): Promise<ProcessRecord[]> =>
  processRepository.findByCustomer(tenantId, customerId);
