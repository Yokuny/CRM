import mongoose, { Schema } from 'mongoose';

export type PaymentStatus = 'pending' | 'paid' | 'expired' | 'refunded' | 'canceled';

export interface PaymentDocument {
  _id: mongoose.Types.ObjectId;
  Tenant: mongoose.Types.ObjectId;
  order: mongoose.Types.ObjectId; // unique — no máximo um Payment por Order (design.md, escopo P1)
  asaasChargeId: string; // unique
  asaasCustomerId: string;
  billingType: 'PIX'; // literal para P1 — uma feature futura amplia este enum
  value: number; // inteiro, centavos — snapshot de Order.totalPrice na criação
  status: PaymentStatus;
  asaasStatus: string; // status bruto do Asaas, para observabilidade (espelha a referência)
  pixPayload?: string; // copia-e-cola
  pixEncodedImage?: string; // QR base64 — best-effort, pode estar ausente
  pixExpirationDate?: Date; // validade PRÓPRIA do QR do Asaas (até 12 meses) — informativo, não é o que rege nossa expiração
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<PaymentDocument>(
  {
    Tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
    asaasChargeId: { type: String, required: true, unique: true, trim: true },
    asaasCustomerId: { type: String, required: true, trim: true },
    billingType: { type: String, enum: ['PIX'], required: true },
    value: { type: Number, required: true, min: 0, validate: { validator: Number.isInteger, message: 'value deve ser um inteiro (centavos)' } },
    status: {
      type: String,
      enum: ['pending', 'paid', 'expired', 'refunded', 'canceled'],
      default: 'pending',
      required: true,
    },
    asaasStatus: { type: String, required: true, trim: true },
    pixPayload: { type: String, required: false },
    pixEncodedImage: { type: String, required: false },
    pixExpirationDate: { type: Date, required: false },
  },
  { timestamps: true, collection: 'payments' },
);

export const Payment = mongoose.model<PaymentDocument>('Payment', paymentSchema);
