import mongoose, { Schema } from 'mongoose';

export interface ProcessDocument {
  _id: mongoose.Types.ObjectId;
  Tenant: mongoose.Types.ObjectId;
  customer: mongoose.Types.ObjectId;
  template: mongoose.Types.ObjectId;
  templateVersion: number;
  stage: string;
  values: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// Mesmo trade-off Mixed de customer.model.ts/fieldTemplateVersion.model.ts:
// `values` já foi validado pelo field-engine antes de chegar aqui.
const processSchema = new Schema<ProcessDocument>(
  {
    Tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    template: { type: Schema.Types.ObjectId, ref: 'FieldTemplate', required: true },
    templateVersion: { type: Number, required: true, min: 1 },
    stage: { type: String, required: true, trim: true },
    values: { type: Schema.Types.Mixed, required: true, default: {} },
  },
  { timestamps: true, collection: 'processes' },
);

// {Tenant,customer} — histórico de Process de um Customer (P2/CORE-11).
processSchema.index({ Tenant: 1, customer: 1 });
// {Tenant,template,templateVersion} — espelha EXATAMENTE a forma do filtro
// usado por FieldValueStore.countByTemplateVersion/migrateValues (AD-021).
processSchema.index({ Tenant: 1, template: 1, templateVersion: 1 });

export const Process = mongoose.model<ProcessDocument>('Process', processSchema);
