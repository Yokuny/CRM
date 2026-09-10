import mongoose, { Schema } from 'mongoose';

export type AsaasEventStatus = 'received' | 'processed' | 'failed';

export interface AsaasEventDocument {
  _id: mongoose.Types.ObjectId;
  Tenant: mongoose.Types.ObjectId;
  // unique — id do próprio Asaas, ou um fallback sintetizado
  // `${event}:${asaasChargeId}:${asaasStatus}` (spec.md Edge Cases, limitação
  // documentada quando o payload não traz um id estável).
  asaasEventId: string;
  event: string; // nome bruto do evento do Asaas, ex.: 'PAYMENT_CONFIRMED'
  payload: unknown; // corpo bruto do webhook (Mixed) — nunca parseado estritamente (payloads do Asaas evoluem)
  status: AsaasEventStatus;
  attempts: number;
  error?: string;
  receivedAt: Date;
  processedAt?: Date;
}

const asaasEventSchema = new Schema<AsaasEventDocument>(
  {
    Tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    asaasEventId: { type: String, required: true, unique: true, trim: true },
    event: { type: String, required: true, trim: true },
    payload: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ['received', 'processed', 'failed'],
      default: 'received',
      required: true,
    },
    attempts: { type: Number, required: true, default: 0, min: 0 },
    error: { type: String, required: false },
    receivedAt: { type: Date, required: true },
    processedAt: { type: Date, required: false },
  },
  { collection: 'asaasEvents' },
);

export const AsaasEvent = mongoose.model<AsaasEventDocument>('AsaasEvent', asaasEventSchema);
