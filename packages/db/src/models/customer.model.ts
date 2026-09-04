import mongoose, { Schema } from 'mongoose';

export interface CustomerDocument {
  _id: mongoose.Types.ObjectId;
  Tenant: mongoose.Types.ObjectId;
  name: string;
  phone: string;
  document?: string;
  template: mongoose.Types.ObjectId;
  templateVersion: number;
  values: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// `values` já foi validado pelo field-engine (validate()) antes de chegar
// aqui — mesmo trade-off Mixed já documentado em fieldTemplateVersion.model.ts
// (Zod é a fonte única de validação, duplicá-la em Mongoose ficaria fora de
// sincronia). `phone`/`document` chegam já normalizados pelo service
// (customer.service, T13) — o model não reaplica a normalização.
const customerSchema = new Schema<CustomerDocument>(
  {
    Tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    document: { type: String, required: false, trim: true },
    template: { type: Schema.Types.ObjectId, ref: 'FieldTemplate', required: true },
    templateVersion: { type: Number, required: true, min: 1 },
    values: { type: Schema.Types.Mixed, required: true, default: {} },
  },
  { timestamps: true, collection: 'customers' },
);

// Busca (CORE-03) — nenhum índice único aqui: dedup de Customer por
// telefone/documento repetido está fora de escopo nesta rodada (spec
// Assumptions), então dois Customer com o mesmo {Tenant,phone} devem
// persistir sem conflito.
customerSchema.index({ Tenant: 1, name: 1 });
customerSchema.index({ Tenant: 1, phone: 1 });
// AD-025: compound wildcard — filtra/ordena por qualquer campo dinâmico do
// tenant (ex.: `values.status`, usado tanto pela listagem quanto pela coluna
// do kanban) sem denormalizar nenhum campo fora de `values`.
customerSchema.index({ Tenant: 1, 'values.$**': 1 });

export const Customer = mongoose.model<CustomerDocument>('Customer', customerSchema);
