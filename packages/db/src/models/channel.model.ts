import mongoose, { Schema } from 'mongoose';
import type { EncryptedSecret } from '../crypto.helper.js';

export interface ChannelDocument {
  _id: mongoose.Types.ObjectId;
  Tenant: mongoose.Types.ObjectId;
  phoneNumberId: string;
  wabaId?: string;
  displayPhoneNumber?: string;
  accessTokenEnc: EncryptedSecret;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

// Mesma forma de sub-schema embutido de
// DentalEase-BackEnd/src/database/asaas-integration.database.ts
// (encryptedSecretSchema, {_id:false}) — os 3 campos são base64
// (crypto.helper.ts, T1).
const encryptedSecretSchema = new Schema(
  {
    ciphertext: { type: String, required: true },
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
  },
  { _id: false },
);

const channelSchema = new Schema<ChannelDocument>(
  {
    Tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true },
    phoneNumberId: { type: String, required: true, unique: true, trim: true },
    wabaId: { type: String, required: false, trim: true },
    displayPhoneNumber: { type: String, required: false, trim: true },
    accessTokenEnc: { type: encryptedSecretSchema, required: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', required: true },
  },
  { timestamps: true, collection: 'channels' },
);

export const Channel = mongoose.model<ChannelDocument>('Channel', channelSchema);
