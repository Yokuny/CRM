import type { FieldDef } from '@crm/contracts';
import mongoose, { Schema } from 'mongoose';

export interface FieldTemplateVersionDocument {
  _id: mongoose.Types.ObjectId;
  Tenant: mongoose.Types.ObjectId;
  template: mongoose.Types.ObjectId;
  targetType: 'customer' | 'process';
  version: number;
  fields: FieldDef[];
  stages?: string[];
  createdAt: Date;
}

// Primeiro (e único) campo `Mixed` do projeto: a árvore `FieldDef` é recursiva
// e já foi validada por `fieldDefSchema` antes de chegar aqui — duplicá-la em
// Mongoose contrariaria a convenção "Zod é fonte única de validação" e ficaria
// fora de sincronia no primeiro tipo novo. Trade-off assumido no design.md.
// Sem `updatedAt`: a versão é um snapshot imutável, nunca reescrito (FLD-06).
const fieldTemplateVersionSchema = new Schema<FieldTemplateVersionDocument>(
  {
    Tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    template: { type: Schema.Types.ObjectId, ref: 'FieldTemplate', required: true },
    targetType: { type: String, enum: ['customer', 'process'], required: true },
    version: { type: Number, required: true, min: 1 },
    fields: { type: Schema.Types.Mixed, required: true },
    // AD-023: fonte de verdade da guarda de transição de Process
    // (CORE-09/17) — populado só quando targetType === 'process'; a
    // obrigatoriedade em si é aplicada em contracts/service (T2/T9), não
    // aqui no schema Mongoose. `default: undefined` evita o auto-init de
    // array do Mongoose (`[]`) para documentos `customer`, que não têm
    // stage — o campo precisa ficar AUSENTE, não uma lista vazia.
    stages: { type: [String], required: false, default: undefined },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'fieldTemplateVersions' },
);

// A GUARDA de concorrência de FLD-17: dois admins bumpando a mesma versão
// disputam este slot, e o perdedor recebe E11000 ANTES de qualquer migração
// rodar. O invariante vive no banco, nunca num `if`.
fieldTemplateVersionSchema.index({ template: 1, version: 1 }, { unique: true });
fieldTemplateVersionSchema.index({ Tenant: 1, targetType: 1 });

export const FieldTemplateVersion = mongoose.model<FieldTemplateVersionDocument>(
  'FieldTemplateVersion',
  fieldTemplateVersionSchema,
);
