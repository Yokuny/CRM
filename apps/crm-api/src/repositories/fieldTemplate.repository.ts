import type { FieldDef, FieldTemplateTargetType } from '@crm/contracts';
import type { FieldTemplateDocument } from '@crm/db';
import { archiveFieldTemplate, FieldTemplate, FieldTemplateVersion, tenantScoped } from '@crm/db';
import { withDbTiming } from '../metrics/db.metric.js';

export type TemplateRecord = {
  id: string;
  targetType: FieldTemplateTargetType;
  key: string;
  name: string;
  currentVersion: number;
  archived: boolean;
};

const toRecord = (doc: FieldTemplateDocument): TemplateRecord => ({
  id: doc._id.toString(),
  targetType: doc.targetType,
  key: doc.key,
  name: doc.name,
  currentVersion: doc.currentVersion,
  archived: doc.archived,
});

export type CreateTemplateInput = {
  tenant: string;
  targetType: FieldTemplateTargetType;
  key: string;
  name: string;
};

// O índice único {Tenant,targetType,key} é quem rejeita a duplicata: o erro
// E11000 sobe daqui sem tratamento, e o service decide o 409 (FLD-04/AC1).
export const createTemplate = async (data: CreateTemplateInput): Promise<{ id: string }> =>
  withDbTiming('fieldTemplate.createTemplate', async () => {
    const template = await FieldTemplate.create({
      Tenant: data.tenant,
      targetType: data.targetType,
      key: data.key,
      name: data.name,
      currentVersion: 1,
    });
    return { id: template.id };
  });

export const findTemplateByTargetKey = async (
  tenantId: string,
  targetType: FieldTemplateTargetType,
  key: string,
): Promise<TemplateRecord | null> =>
  withDbTiming('fieldTemplate.findTemplateByTargetKey', async () => {
    const doc = await FieldTemplate.findOne(tenantScoped({ Tenant: tenantId, targetType, key })).lean();
    return doc ? toRecord(doc) : null;
  });

// Toda rota por :id passa por aqui antes de escrever: o filtro carrega o
// Tenant, então o id de outro tenant simplesmente não existe (AD-010).
export const findTemplateById = async (tenantId: string, id: string): Promise<TemplateRecord | null> =>
  withDbTiming('fieldTemplate.findTemplateById', async () => {
    const doc = await FieldTemplate.findOne(tenantScoped({ Tenant: tenantId, _id: id })).lean();
    return doc ? toRecord(doc) : null;
  });

export const findCurrentVersion = async (
  tenantId: string,
  templateId: string,
  version: number,
): Promise<{ fields: FieldDef[]; stages?: string[] } | null> =>
  withDbTiming('fieldTemplate.findCurrentVersion', async () => {
    const doc = await FieldTemplateVersion.findOne(
      tenantScoped({ Tenant: tenantId, template: templateId, version }),
    ).lean();
    return doc ? { fields: doc.fields, stages: doc.stages } : null;
  });

// WEB-07: lista TODOS os templates do Tenant para um targetType, arquivados
// inclusive — quem decide visibilidade/desabilitar é o front-end (design.md),
// nunca o repositório/serviço.
export const findTemplatesByTargetType = async (
  tenantId: string,
  targetType: FieldTemplateTargetType,
): Promise<TemplateRecord[]> =>
  withDbTiming('fieldTemplate.findTemplatesByTargetType', async () => {
    const docs = await FieldTemplate.find(tenantScoped({ Tenant: tenantId, targetType })).lean();
    return docs.map(toRecord);
  });

export type ClaimVersionSlotInput = {
  tenant: string;
  template: string;
  targetType: FieldTemplateTargetType;
  version: number;
  fields: FieldDef[];
  stages?: string[];
};

// A reivindicação do slot {template, version} É a guarda de concorrência de
// FLD-17. O E11000 do índice único sobe sem tratamento: quem perdeu a corrida
// não migra nada, e é o service que traduz para 409.
export const claimVersionSlot = async (data: ClaimVersionSlotInput): Promise<void> =>
  withDbTiming('fieldTemplate.claimVersionSlot', async () => {
    await FieldTemplateVersion.create({
      Tenant: data.tenant,
      template: data.template,
      targetType: data.targetType,
      version: data.version,
      fields: data.fields,
      stages: data.stages,
    });
  });

// Devolve o slot {template, version} ao pool quando a migração destrutiva
// falha. Sem isso o índice único guarda para sempre uma versão que nunca
// chegou a existir, e reaplicar o mesmo bump devolveria 409 permanente
// (FLD-12: o rollback é completo, não só do ponteiro).
export const releaseVersionSlot = async (tenantId: string, templateId: string, version: number): Promise<void> =>
  withDbTiming('fieldTemplate.releaseVersionSlot', async () => {
    await FieldTemplateVersion.deleteOne(tenantScoped({ Tenant: tenantId, template: templateId, version }));
  });

// Último passo do bump: só quem reivindicou o slot e concluiu a migração
// chega aqui (FLD-12 — o ponteiro nunca avança para uma versão não migrada).
export const updateCurrentVersion = async (templateId: string, version: number): Promise<void> =>
  withDbTiming('fieldTemplate.updateCurrentVersion', async () => {
    await FieldTemplate.findByIdAndUpdate(templateId, { currentVersion: version });
  });

export const archiveTemplate = async (id: string): Promise<TemplateRecord | null> =>
  withDbTiming('fieldTemplate.archiveTemplate', async () => {
    const doc = await archiveFieldTemplate(id);
    return doc ? toRecord(doc) : null;
  });
