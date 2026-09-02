import mongoose, { Schema } from 'mongoose';

export interface SessionDocument {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  Tenant?: mongoose.Types.ObjectId;
  tokenHash: string;
  deviceInfo: string;
  expiresAt: Date;
  createdAt: Date;
}

const sessionSchema = new Schema<SessionDocument>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    Tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: false },
    tokenHash: { type: String, required: true, unique: true },
    deviceInfo: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

sessionSchema.index({ user: 1 });
// TTL real (FND-16): o Mongo apaga o documento da sessão sozinho, sem afetar
// o usuário — por isso é collection própria, e não refreshToken[] no User.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = mongoose.model<SessionDocument>('Session', sessionSchema);
