import crypto from 'node:crypto';
import mongoose, { Schema } from 'mongoose';

export type InviteStatus = 'pending' | 'accepted' | 'revoked';

export interface InviteDocument {
  _id: mongoose.Types.ObjectId;
  Tenant: mongoose.Types.ObjectId;
  email: string;
  role: 'admin' | 'gestor' | 'operador';
  tokenHash: string;
  status: InviteStatus;
  expiresAt: Date;
  invitedBy: mongoose.Types.ObjectId;
  sentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const inviteSchema = new Schema<InviteDocument>(
  {
    Tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: ['admin', 'gestor', 'operador'], required: true },
    tokenHash: { type: String, required: true, unique: true },
    status: { type: String, enum: ['pending', 'accepted', 'revoked'], default: 'pending', required: true },
    expiresAt: { type: Date, required: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sentAt: { type: Date, required: false },
  },
  { timestamps: true },
);

// Nunca dois convites `pending` para o mesmo par Tenant+email (FND-13) — o
// invariante é do índice parcial, não do código.
inviteSchema.index({ Tenant: 1, email: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } });
inviteSchema.index({ Tenant: 1, status: 1 });

export const Invite = mongoose.model<InviteDocument>('Invite', inviteSchema);

// O token opaco nunca é gravado — só o hash. Vazamento do banco não produz
// convite utilizável.
export const hashToken = (token: string): string => crypto.createHash('sha256').update(token).digest('hex');
