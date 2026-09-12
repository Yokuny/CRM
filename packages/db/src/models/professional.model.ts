import mongoose, { Schema } from 'mongoose';
import type { ScheduleWindow } from '../scheduling.js';

export interface ProfessionalDocument {
  _id: mongoose.Types.ObjectId;
  Tenant: mongoose.Types.ObjectId;
  name: string;
  slotDurationMinutes: number; // 5..480
  weeklySchedule: ScheduleWindow[]; // janelas do mesmo weekday sem sobreposição (contracts, T10) — este model só valida faixa/obrigatoriedade
  active: boolean; // default true
  createdAt: Date;
  updatedAt: Date;
}

// Subdocumento sem _id próprio — janela é sempre lida/gravada como array
// inteiro (scheduling.ts consome ScheduleWindow[] diretamente).
const scheduleWindowSchema = new Schema<ScheduleWindow>(
  {
    weekday: { type: Number, required: true, min: 0, max: 6 },
    start: { type: String, required: true, trim: true },
    end: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const professionalSchema = new Schema<ProfessionalDocument>(
  {
    Tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    name: { type: String, required: true, trim: true },
    slotDurationMinutes: { type: Number, required: true, min: 5, max: 480 },
    // Mongoose inicializa array ausente como `[]` por padrão, então
    // `required: true` sozinho nunca rejeita omissão (SchemaArray.checkRequired
    // só verifica `Array.isArray`) — o validador customizado é o que de fato
    // torna a grade obrigatória (SCH-01).
    weeklySchedule: {
      type: [scheduleWindowSchema],
      required: true,
      validate: {
        validator: (value: ScheduleWindow[]) => Array.isArray(value) && value.length > 0,
        message: 'weeklySchedule é obrigatório e precisa de ao menos uma janela',
      },
    },
    active: { type: Boolean, required: true, default: true },
  },
  { timestamps: true, collection: 'professionals' },
);

// {Tenant,active} — get_available_slots/listagem filtram só profissionais
// ativos do tenant (design.md).
professionalSchema.index({ Tenant: 1, active: 1 });

export const Professional = mongoose.model<ProfessionalDocument>('Professional', professionalSchema);
