import mongoose, { Schema } from 'mongoose';

export type OrderStatus = 'pending_approval' | 'confirmed' | 'rejected' | 'payment_expired';

export interface OrderItem {
  product: mongoose.Types.ObjectId;
  name: string; // snapshot no momento da criação
  unitPrice: number; // snapshot, centavos
  quantity: number;
}

export interface OrderDocument {
  _id: mongoose.Types.ObjectId;
  Tenant: mongoose.Types.ObjectId;
  conversation: mongoose.Types.ObjectId;
  customer: mongoose.Types.ObjectId;
  items: OrderItem[];
  totalPrice: number; // centavos, soma de unitPrice*quantity
  status: OrderStatus;
  idempotencyKey: string;
  customerConfirmed: boolean; // default false — escrito por ai-gateway
  operatorApproved: boolean; // default false — escrito por crm-api
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  rejectedBy?: mongoose.Types.ObjectId;
  rejectedAt?: Date;
  rejectionReason?: string;
  confirmFailureReason?: string; // último motivo de falha da reserva atômica, se houver
  createdAt: Date;
  updatedAt: Date;
}

// Sub-documento tipado (ao contrário de Process.values, Mixed) — snapshot de
// name/unitPrice gravado na criação, nunca recarrega o preço atual do
// Product (design.md, Order.items[].product relationship).
const orderItemSchema = new Schema<OrderItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true, trim: true },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const orderSchema = new Schema<OrderDocument>(
  {
    Tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    items: { type: [orderItemSchema], required: true },
    totalPrice: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['pending_approval', 'confirmed', 'rejected', 'payment_expired'],
      default: 'pending_approval',
      required: true,
    },
    idempotencyKey: { type: String, required: true, trim: true },
    customerConfirmed: { type: Boolean, required: true, default: false },
    operatorApproved: { type: Boolean, required: true, default: false },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    approvedAt: { type: Date, required: false },
    rejectedBy: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    rejectedAt: { type: Date, required: false },
    rejectionReason: { type: String, required: false, trim: true },
    confirmFailureReason: { type: String, required: false, trim: true },
  },
  { timestamps: true, collection: 'orders' },
);

// Único: garante idempotência de create_order na camada de dado, não só na
// lógica de app (design.md, AD-033).
orderSchema.index({ Tenant: 1, conversation: 1, idempotencyKey: 1 }, { unique: true });
// Fila de Pedidos (GET /orders, design.md).
orderSchema.index({ Tenant: 1, status: 1, createdAt: -1 });

export const Order = mongoose.model<OrderDocument>('Order', orderSchema);
