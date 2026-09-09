import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../tests/helpers/db.helper.js';
import { encrypt } from '../crypto.helper.js';
import { AsaasIntegration } from './asaasIntegration.model.js';

const KEY = Buffer.alloc(32, 7).toString('base64');

const baseIntegration = (Tenant: mongoose.Types.ObjectId, overrides: Partial<Record<string, unknown>> = {}) => ({
  Tenant,
  apiKeyEnc: encrypt('$aact_hmlg_chave-de-teste', KEY),
  environment: 'sandbox',
  webhookToken: `token_${new mongoose.Types.ObjectId().toString()}`,
  webhookAuthTokenHash: 'a'.repeat(64),
  ...overrides,
});

describe('AsaasIntegration model', () => {
  useTestDb();

  it('rejects a second AsaasIntegration for the same Tenant (unique index)', async () => {
    await AsaasIntegration.init();
    const Tenant = new mongoose.Types.ObjectId();
    await AsaasIntegration.create(baseIntegration(Tenant));

    await expect(
      AsaasIntegration.create(baseIntegration(Tenant, { webhookToken: 'another-token' })),
    ).rejects.toThrow();
  });

  it('rejects a second AsaasIntegration with the same webhookToken (unique index)', async () => {
    await AsaasIntegration.init();
    const sharedToken = 'shared-webhook-token';
    await AsaasIntegration.create(baseIntegration(new mongoose.Types.ObjectId(), { webhookToken: sharedToken }));

    await expect(
      AsaasIntegration.create(baseIntegration(new mongoose.Types.ObjectId(), { webhookToken: sharedToken })),
    ).rejects.toThrow();
  });

  it('persists and reloads the 3 apiKeyEnc keys (ciphertext/iv/authTag)', async () => {
    const Tenant = new mongoose.Types.ObjectId();
    const secret = encrypt('$aact_prod_chave-de-teste', KEY);
    await AsaasIntegration.create(baseIntegration(Tenant, { apiKeyEnc: secret }));

    const reloaded = await AsaasIntegration.findOne({ Tenant }).lean();

    expect(reloaded?.apiKeyEnc).toEqual({
      ciphertext: secret.ciphertext,
      iv: secret.iv,
      authTag: secret.authTag,
    });
  });

  it('declares the {Tenant} and {webhookToken} unique indexes', async () => {
    await AsaasIntegration.init();

    const indexes = await AsaasIntegration.collection.indexes();
    const uniqueKeys = indexes.filter((index) => index.unique).map((index) => JSON.stringify(index.key));

    expect(uniqueKeys).toContain(JSON.stringify({ Tenant: 1 }));
    expect(uniqueKeys).toContain(JSON.stringify({ webhookToken: 1 }));
  });

  it('defaults status to active and stamps createdAt/updatedAt', async () => {
    const created = await AsaasIntegration.create(baseIntegration(new mongoose.Types.ObjectId()));

    expect(created.status).toBe('active');
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(created.updatedAt).toBeInstanceOf(Date);
  });

  // design.md: `environment: 'sandbox' | 'production'` — enum fechado,
  // auto-detectado do prefixo da chave, nunca um valor livre.
  it('rejects an environment outside sandbox|production', async () => {
    await expect(
      AsaasIntegration.create(baseIntegration(new mongoose.Types.ObjectId(), { environment: 'staging' })),
    ).rejects.toThrow();
  });

  it('persists an optional asaasWebhookId when provided, and omits it when absent', async () => {
    const withWebhookId = await AsaasIntegration.create(
      baseIntegration(new mongoose.Types.ObjectId(), { asaasWebhookId: 'wh_000000000001' }),
    );
    const withoutWebhookId = await AsaasIntegration.create(baseIntegration(new mongoose.Types.ObjectId()));

    expect(withWebhookId.asaasWebhookId).toBe('wh_000000000001');
    expect(withoutWebhookId.asaasWebhookId).toBeUndefined();
  });
});
