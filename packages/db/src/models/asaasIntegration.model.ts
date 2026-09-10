import mongoose, { Schema } from 'mongoose';
import type { EncryptedSecret } from '../crypto.helper.js';

export type AsaasEnvironment = 'sandbox' | 'production';
export type AsaasIntegrationStatus = 'active' | 'inactive';

export interface AsaasIntegrationDocument {
  _id: mongoose.Types.ObjectId;
  Tenant: mongoose.Types.ObjectId; // unique — uma integração Asaas por tenant
  apiKeyEnc: EncryptedSecret; // crypto.helper.ts, mesma forma de Channel.accessTokenEnc
  environment: AsaasEnvironment; // auto-detectado do prefixo da chave, nunca um campo de formulário
  webhookToken: string; // unique, opaco — path param que identifica o tenant no callback do Asaas
  webhookAuthTokenHash: string; // sha256(authToken) — o authToken em si nunca é armazenado cru
  asaasWebhookId?: string; // id do webhook no Asaas, para rotação/limpeza futura
  status: AsaasIntegrationStatus;
  createdAt: Date;
  updatedAt: Date;
}

// Mesma forma de sub-schema embutido de Channel.accessTokenEnc
// (channel.model.ts) — os 3 campos são base64 (crypto.helper.ts).
const encryptedSecretSchema = new Schema(
  {
    ciphertext: { type: String, required: true },
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
  },
  { _id: false },
);

const asaasIntegrationSchema = new Schema<AsaasIntegrationDocument>(
  {
    Tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true },
    apiKeyEnc: { type: encryptedSecretSchema, required: true },
    environment: { type: String, enum: ['sandbox', 'production'], required: true },
    webhookToken: { type: String, required: true, unique: true, trim: true },
    webhookAuthTokenHash: { type: String, required: true },
    asaasWebhookId: { type: String, required: false, trim: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', required: true },
  },
  { timestamps: true, collection: 'asaasIntegrations' },
);

export const AsaasIntegration = mongoose.model<AsaasIntegrationDocument>('AsaasIntegration', asaasIntegrationSchema);
