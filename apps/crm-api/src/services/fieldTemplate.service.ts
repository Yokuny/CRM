import type { BumpFieldTemplate, CreateFieldTemplate, FieldDef, FieldTemplateTargetType } from '@crm/contracts';
import { DEFAULT_CUSTOMER_TEMPLATE_KEY, diffFields } from '@crm/field-engine';
import { CustomError } from '../middlewares/errorHandler.middleware.js';
import type { FieldValueStore } from '../providers/fieldValueStore/index.js';
import * as fieldTemplateRepository from '../repositories/fieldTemplate.repository.js';

// Mesmo predicado de platform.service.ts: o índice único é quem rejeita a
// duplicata; aqui só traduzimos o código do driver para o status HTTP.
const isDuplicateKeyError = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && 'code' in e && (e as { code: unknown }).code === 11000;

// Um store por targetType (AD-021) — no-op nesta feature, adapters reais em
// crm-core, sem que nada aqui mude.
export type FieldValueStores = Record<FieldTemplateTargetType, FieldValueStore>;

export type CurrentTemplate = {
  template: { id: string; name: string; currentVersion: number; archived: boolean };
  fields: FieldDef[];
  stages?: string[];
};

// `customer` tem exatamente um template por Tenant: a chave é sempre a padrão,
// nunca a que o corpo mandou (o schema aceita a forma, a regra de negócio é
// daqui). `process` usa a chave escolhida pelo admin.
const resolveKey = (data: CreateFieldTemplate): string =>
  data.targetType === 'customer' ? DEFAULT_CUSTOMER_TEMPLATE_KEY : (data.key as string);

export const createFieldTemplate = async (
  tenantId: string,
  data: CreateFieldTemplate,
): Promise<{ id: string; currentVersion: number }> => {
  let template: { id: string };
  try {
    template = await fieldTemplateRepository.createTemplate({
      tenant: tenantId,
      targetType: data.targetType,
      key: resolveKey(data),
      name: data.name,
    });
  } catch (e) {
    if (isDuplicateKeyError(e)) {
      throw new CustomError('Já existe um template para este tipo de entidade e chave', 409);
    }
    throw e;
  }

  await fieldTemplateRepository.claimVersionSlot({
    tenant: tenantId,
    template: template.id,
    targetType: data.targetType,
    version: 1,
    fields: data.fields,
    stages: data.stages,
  });

  return { id: template.id, currentVersion: 1 };
};

export const getCurrentTemplate = async (
  tenantId: string,
  targetType: FieldTemplateTargetType,
  key: string,
): Promise<CurrentTemplate | null> => {
  const template = await fieldTemplateRepository.findTemplateByTargetKey(tenantId, targetType, key);
  if (!template) return null;

  const version = await fieldTemplateRepository.findCurrentVersion(tenantId, template.id, template.currentVersion);
  if (!version) return null;

  return {
    template: {
      id: template.id,
      name: template.name,
      currentVersion: template.currentVersion,
      archived: template.archived,
    },
    fields: version.fields,
    stages: version.stages,
  };
};

// WEB-07: descoberta de templates para o seletor de "novo Process" — devolve
// `key`/`label`/`archived` de todo template do targetType, arquivado incluso;
// esconder/desabilitar o arquivado é decisão do front-end (design.md).
export const listTemplates = async (
  tenantId: string,
  targetType: FieldTemplateTargetType,
): Promise<{ key: string; label: string; archived: boolean }[]> => {
  const templates = await fieldTemplateRepository.findTemplatesByTargetType(tenantId, targetType);
  return templates.map((template) => ({ key: template.key, label: template.name, archived: template.archived }));
};

// Ordem do sequence diagram do design.md, e ela é o contrato: diff →
// cobertura da migração → claim do slot → migração → ponteiro. Nada é
// escrito antes da checagem de cobertura (FLD-05), e o ponteiro só avança
// depois da migração ter terminado (FLD-12).
export const bumpFieldTemplateVersion = async (
  tenantId: string,
  templateId: string,
  data: BumpFieldTemplate,
  actor: string,
  stores: FieldValueStores,
): Promise<{ currentVersion: number }> => {
  const template = await fieldTemplateRepository.findTemplateById(tenantId, templateId);
  if (!template) throw new CustomError('Template não encontrado', 404);

  // AD-023: o schema (bumpFieldTemplateSchema) não tem `targetType` para
  // exigir `stages` estaticamente — mesmo split já usado em `resolveKey` para
  // customer/process em createFieldTemplate. Roda ANTES de reivindicar
  // qualquer slot, para nunca deixar uma versão órfã no índice único.
  if (template.targetType === 'process' && !data.stages) {
    throw new CustomError('stages é obrigatório para bump de template process', 400);
  }

  const base = await fieldTemplateRepository.findCurrentVersion(tenantId, template.id, data.expectedVersion);
  if (!base) {
    throw new CustomError('Versão informada não existe neste template. Recarregue a versão corrente.', 409);
  }

  const diff = diffFields(base.fields, data.fields);
  const nextVersion = data.expectedVersion + 1;
  const migration = data.migration ?? {};

  if (diff.kind === 'destructive') {
    const uncovered = diff.changes.filter((change) => !(change.fieldId in migration));
    if (uncovered.length > 0) {
      throw new CustomError(
        `Mudança destrutiva exige plano de migração para: ${uncovered.map((change) => change.fieldId).join(', ')}`,
        400,
      );
    }
  }

  try {
    await fieldTemplateRepository.claimVersionSlot({
      tenant: tenantId,
      template: template.id,
      targetType: template.targetType,
      version: nextVersion,
      fields: data.fields,
      stages: data.stages,
    });
  } catch (e) {
    if (isDuplicateKeyError(e)) {
      throw new CustomError('Outro bump já avançou este template. Recarregue a versão corrente.', 409);
    }
    throw e;
  }

  if (diff.kind === 'destructive') {
    // Se migrateValues lançar, o ponteiro NUNCA avança E o slot reivindicado é
    // devolvido: sem essa devolução o índice único {template,version} manteria
    // para sempre uma versão que nunca existiu, e reaplicar o MESMO bump
    // receberia 409 permanente ("outro bump já avançou") sem que nada tivesse
    // avançado. O rollback de FLD-12 é completo, não só do ponteiro.
    let migrated: number;
    try {
      ({ migrated } = await stores[template.targetType].migrateValues(
        tenantId,
        template.id,
        data.expectedVersion,
        nextVersion,
        migration,
      ));
    } catch (e) {
      await fieldTemplateRepository.releaseVersionSlot(tenantId, template.id, nextVersion);
      throw e;
    }

    console.log(
      JSON.stringify({
        event: 'fieldTemplate.destructive_migration',
        at: new Date().toISOString(),
        actor,
        tenant: tenantId,
        template: template.id,
        fromVersion: data.expectedVersion,
        toVersion: nextVersion,
        fieldsAffected: diff.changes.map((change) => change.fieldId),
        recordsMigrated: migrated,
      }),
    );
  }

  await fieldTemplateRepository.updateCurrentVersion(template.id, nextVersion);

  return { currentVersion: nextVersion };
};

// Arquivar duas vezes é no-op idempotente: a guarda por query do model devolve
// null na segunda, e a resposta continua sendo a mesma (FLD-19).
export const archiveFieldTemplate = async (
  tenantId: string,
  templateId: string,
): Promise<{ id: string; archived: boolean }> => {
  const template = await fieldTemplateRepository.findTemplateById(tenantId, templateId);
  if (!template) throw new CustomError('Template não encontrado', 404);

  await fieldTemplateRepository.archiveTemplate(template.id);

  return { id: template.id, archived: true };
};
