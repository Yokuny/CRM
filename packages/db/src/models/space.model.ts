import mongoose, { Schema } from 'mongoose';

// Puramente informativo (spec.md Assumptions: `Space` não restringe
// disponibilidade) — usado só em filtro/registro, sem relação com
// Professional.
export interface SpaceDocument {
  _id: mongoose.Types.ObjectId;
  Tenant: mongoose.Types.ObjectId;
  name: string;
  active: boolean; // default true
  createdAt: Date;
  updatedAt: Date;
}

const spaceSchema = new Schema<SpaceDocument>(
  {
    Tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    name: { type: String, required: true, trim: true },
    active: { type: Boolean, required: true, default: true },
  },
  { timestamps: true, collection: 'spaces' },
);

// {Tenant,active} — mesma forma de professionalSchema (listagem/filtro).
spaceSchema.index({ Tenant: 1, active: 1 });

export const Space = mongoose.model<SpaceDocument>('Space', spaceSchema);
