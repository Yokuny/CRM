import mongoose, { Schema } from 'mongoose';

export type AppointmentKind = 'appointment' | 'block';
export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'completed'
  | 'no_show'
  | 'canceled_by_customer'
  | 'canceled_by_operator';
export type AppointmentSource = 'ai' | 'operator';

// Discriminada por `kind` (AD-035): agendamento e bloqueio na mesma coleção,
// disputando o mesmo horário pelo mesmo índice único parcial. Bloqueio nasce
// e permanece `status:'confirmed'` e é removido por deleção — nunca cancelado
// (design.md, seção Data Models).
export interface AppointmentDocument {
  _id: mongoose.Types.ObjectId;
  Tenant: mongoose.Types.ObjectId;
  kind: AppointmentKind;
  professional: mongoose.Types.ObjectId; // obrigatório nos dois kinds
  space?: mongoose.Types.ObjectId; // opcional, nunca restringe (spec.md Assumptions)
  customer?: mongoose.Types.ObjectId; // obrigatório só quando kind === 'appointment'
  conversation?: mongoose.Types.ObjectId; // presente quando criado pela IA
  title?: string; // usado pelo bloqueio
  notes?: string;
  start: Date; // sempre UTC (AD-036)
  end: Date; // sempre UTC (AD-036)
  status: AppointmentStatus;
  source: AppointmentSource;
  confirmationTokenHash?: string; // sha256 do token opaco; texto claro nunca persistido
  confirmationExpiresAt?: Date;
  confirmedAt?: Date;
  canceledAt?: Date;
  canceledBy?: mongoose.Types.ObjectId;
  cancelReason?: string;
  attendanceMarkedAt?: Date;
  attendanceMarkedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const appointmentSchema = new Schema<AppointmentDocument>(
  {
    Tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    kind: { type: String, enum: ['appointment', 'block'], required: true },
    professional: { type: Schema.Types.ObjectId, ref: 'Professional', required: true },
    space: { type: Schema.Types.ObjectId, ref: 'Space', required: false },
    // SCH-33: obrigatório só para kind='appointment' — um bloqueio (sem
    // cliente) é válido; um agendamento sem cliente é rejeitado. Mongoose
    // `required` como função é suficiente aqui, sem precisar de pre('validate').
    customer: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required(this: AppointmentDocument) {
        return this.kind === 'appointment';
      },
    },
    conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', required: false },
    title: { type: String, required: false, trim: true },
    notes: { type: String, required: false, trim: true },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'completed', 'no_show', 'canceled_by_customer', 'canceled_by_operator'],
      required: true,
    },
    source: { type: String, enum: ['ai', 'operator'], required: true },
    confirmationTokenHash: { type: String, required: false },
    confirmationExpiresAt: { type: Date, required: false },
    confirmedAt: { type: Date, required: false },
    canceledAt: { type: Date, required: false },
    canceledBy: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    cancelReason: { type: String, required: false, trim: true },
    attendanceMarkedAt: { type: Date, required: false },
    attendanceMarkedBy: { type: Schema.Types.ObjectId, ref: 'User', required: false },
  },
  { timestamps: true, collection: 'appointments' },
);

// SCH-20 — garantia anti-dupla-reserva: o banco elege um vencedor entre
// reservas concorrentes no mesmo (Tenant,professional,start) via índice único
// parcial, em vez de checar-antes-de-gravar (AD-035, lição L-027 da feature 8).
// Um status terminal/cancelado sai do filtro parcial e libera o horário.
appointmentSchema.index(
  { Tenant: 1, professional: 1, start: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['pending', 'confirmed'] } } },
);
// Faixa da semana (tela de Agenda) e varredura de ocupação do dia.
appointmentSchema.index({ Tenant: 1, start: 1 });
// Agendamentos futuros do cliente (SCH-14/SCH-18/SCH-38).
appointmentSchema.index({ Tenant: 1, customer: 1, start: 1 });
// sparse: vários documentos sem token (bloqueio, ou ainda não emitido) não colidem.
appointmentSchema.index({ confirmationTokenHash: 1 }, { unique: true, sparse: true });

export const Appointment = mongoose.model<AppointmentDocument>('Appointment', appointmentSchema);
