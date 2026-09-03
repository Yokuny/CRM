import type { FieldDef } from '@crm/contracts';
import { DEFAULT_CUSTOMER_TEMPLATE_KEY } from '@crm/field-engine';
import mongoose, { Schema } from 'mongoose';
import { FieldTemplateVersion } from './fieldTemplateVersion.model.js';

export interface FieldTemplateDocument {
  _id: mongoose.Types.ObjectId;
  Tenant: mongoose.Types.ObjectId;
  targetType: 'customer' | 'process';
  key: string;
  name: string;
  currentVersion: number;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// `collection` explícito: o nome documentado em docs/architecture.md (tabela de
// propriedade de escrita por collection, AD-002) é camelCase, e a pluralização
// automática do Mongoose devolveria `fieldtemplates`.
const fieldTemplateSchema = new Schema<FieldTemplateDocument>(
  {
    Tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    targetType: { type: String, enum: ['customer', 'process'], required: true },
    key: { type: String, required: true, trim: true },
    name: { type: String, minlength: 3, maxlength: 120, required: true },
    currentVersion: { type: Number, required: true, default: 1, min: 1 },
    archived: { type: Boolean, required: true, default: false },
  },
  { timestamps: true, collection: 'fieldTemplates' },
);

// Um único template por {Tenant, targetType, key} — o invariante é do índice,
// não de um `if` em código: é ele que torna o seed idempotente (FLD-10/11) e o
// que faz uma criação duplicada virar 409 (FLD-04/AC1).
fieldTemplateSchema.index({ Tenant: 1, targetType: 1, key: 1 }, { unique: true });
fieldTemplateSchema.index({ Tenant: 1, targetType: 1 });

export const FieldTemplate = mongoose.model<FieldTemplateDocument>('FieldTemplate', fieldTemplateSchema);

// Mesma forma de transitionTenantStatus (tenant.model.ts): a guarda é a própria
// query. Arquivar um template já arquivado devolve null — no-op idempotente,
// nunca exceção (FLD-19). Template nunca é deletado, só arquivado (FLD-08).
export const archiveFieldTemplate = async (id: string): Promise<FieldTemplateDocument | null> => {
  return FieldTemplate.findOneAndUpdate({ _id: id, archived: false }, { archived: true }, { returnDocument: 'after' })
    .lean()
    .exec();
};

// Seed padrão de `customer` (FLD-09): um único campo `status`, com opções já
// prontas para virar coluna de kanban (key/label/color/order únicos entre si).
export const DEFAULT_CUSTOMER_FIELDS: FieldDef[] = [
  {
    fieldId: 'status',
    label: 'Status',
    type: 'status',
    required: true,
    options: [
      { key: 'novo', label: 'Novo', color: '#3B82F6', order: 0 },
      { key: 'ativo', label: 'Ativo', color: '#22C55E', order: 1 },
      { key: 'inativo', label: 'Inativo', color: '#94A3B8', order: 2 },
    ],
  },
];

// Dois upserts guardados pelos índices únicos — nunca um "if existe" em código:
// a idempotência é do banco (FLD-10) e cura até um estado parcial deixado por
// uma falha anterior no meio do seed. `$setOnInsert` nunca toca um documento
// que já existe, então a customização do admin sobrevive a um reseed (FLD-11).
export const seedDefaultCustomerTemplate = async (tenantId: string): Promise<void> => {
  const template = await FieldTemplate.findOneAndUpdate(
    { Tenant: tenantId, targetType: 'customer', key: DEFAULT_CUSTOMER_TEMPLATE_KEY },
    { $setOnInsert: { name: 'Cliente', currentVersion: 1, archived: false } },
    { upsert: true, returnDocument: 'after' },
  ).lean();

  await FieldTemplateVersion.findOneAndUpdate(
    { template: template._id, version: 1 },
    { $setOnInsert: { Tenant: tenantId, targetType: 'customer', fields: DEFAULT_CUSTOMER_FIELDS } },
    { upsert: true },
  );
};
