import mongoose, { Schema } from 'mongoose';

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
