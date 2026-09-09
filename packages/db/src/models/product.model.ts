import mongoose, { Schema } from 'mongoose';

export interface ProductDocument {
  _id: mongoose.Types.ObjectId;
  Tenant: mongoose.Types.ObjectId;
  name: string;
  sku?: string;
  description?: string;
  price: number; // inteiro, centavos
  stock: number; // inteiro, >= 0
  active: boolean; // default true
  createdAt: Date;
  updatedAt: Date;
}

// Schema fixo (spec.md Assumptions/design.md): sem field-engine, sem índice
// único em `sku` (não exigido — campo livre/opcional, Product é identificado
// por `_id`).
const productSchema = new Schema<ProductDocument>(
  {
    Tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    name: { type: String, required: true, trim: true },
    sku: { type: String, required: false, trim: true },
    description: { type: String, required: false, trim: true },
    price: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, min: 0 },
    active: { type: Boolean, required: true, default: true },
  },
  { timestamps: true, collection: 'products' },
);

// {Tenant,active} — busca de searchProducts/listagem do catálogo (design.md).
productSchema.index({ Tenant: 1, active: 1 });

export const Product = mongoose.model<ProductDocument>('Product', productSchema);
