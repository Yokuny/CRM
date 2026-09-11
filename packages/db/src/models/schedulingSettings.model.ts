import mongoose, { Schema } from 'mongoose';

// Um documento de configuração de agenda por tenant — molde de
// asaasIntegration.model.ts (unique Tenant). Só o teto de horários por
// resposta foi pedido como configurável pelo tenant (spec.md Assumptions);
// horizonte e antecedência mínima ficam como constantes em scheduling.ts.
export interface SchedulingSettingsDocument {
  _id: mongoose.Types.ObjectId;
  Tenant: mongoose.Types.ObjectId; // unique — um doc por tenant
  maxSlotsPerResponse: number; // 1..50, default 16
  createdAt: Date;
  updatedAt: Date;
}

const schedulingSettingsSchema = new Schema<SchedulingSettingsDocument>(
  {
    Tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true },
    maxSlotsPerResponse: { type: Number, required: true, min: 1, max: 50, default: 16 },
  },
  { timestamps: true, collection: 'schedulingSettings' },
);

export const SchedulingSettings = mongoose.model<SchedulingSettingsDocument>('SchedulingSettings', schedulingSettingsSchema);
