import { encrypt, sha256 } from '@crm/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../config/env.config.js';
import type { AsaasIntegrationRecord } from '../repositories/asaasIntegration.repository.js';

const validateApiKeyMock = vi.fn();
const registerWebhookMock = vi.fn();
const createIntegrationMock = vi.fn();
const findByTenantMock = vi.fn();

vi.mock('../providers/asaasClient.js', () => ({
  validateApiKey: (...args: unknown[]) => validateApiKeyMock(...args),
  registerWebhook: (...args: unknown[]) => registerWebhookMock(...args),
}));

vi.mock('../repositories/asaasIntegration.repository.js', () => ({
  createIntegration: (...args: unknown[]) => createIntegrationMock(...args),
  findByTenant: (...args: unknown[]) => findByTenantMock(...args),
}));

const TENANT_ID = 'tenant-1';
const ENC_KEY = env.ASAAS_ENC_KEY;

const sampleRecord = (overrides: Partial<AsaasIntegrationRecord> = {}): AsaasIntegrationRecord => ({
  id: 'integration-1',
  tenant: TENANT_ID,
  apiKeyEnc: encrypt('$aact_hmlg_original-plaintext-key', ENC_KEY),
  environment: 'sandbox',
  webhookToken: 'webhook-token-value',
  webhookAuthTokenHash: 'stored-hash',
  status: 'active',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

describe('asaasIntegration.service (spec.md P1 "Tenant configura sua própria chave Asaas")', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createIntegration', () => {
    it('rejects an invalid/revoked key (AC2) without persisting anything or registering a webhook', async () => {
      const { createIntegration } = await import('./asaasIntegration.service.js');
      validateApiKeyMock.mockResolvedValueOnce(false);

      await expect(createIntegration(TENANT_ID, { apiKey: '$aact_hmlg_bad-key' })).rejects.toMatchObject({
        status: 422,
      });

      expect(registerWebhookMock).not.toHaveBeenCalled();
      expect(createIntegrationMock).not.toHaveBeenCalled();
    });

    it('auto-detects "production" from the $aact_prod_ prefix and passes it to validateApiKey/registerWebhook', async () => {
      const { createIntegration } = await import('./asaasIntegration.service.js');
      validateApiKeyMock.mockResolvedValueOnce(true);
      registerWebhookMock.mockResolvedValueOnce({ asaasWebhookId: 'wh_1' });
      createIntegrationMock.mockResolvedValueOnce(sampleRecord({ environment: 'production' }));

      await createIntegration(TENANT_ID, { apiKey: '$aact_prod_real-key-value' });

      expect(validateApiKeyMock).toHaveBeenCalledWith('$aact_prod_real-key-value', 'production');
      expect(registerWebhookMock).toHaveBeenCalledWith(
        '$aact_prod_real-key-value',
        'production',
        expect.any(String),
        expect.any(String),
      );
      expect(createIntegrationMock).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ environment: 'production' }),
      );
    });

    it('auto-detects "sandbox" for any non-$aact_prod_ prefix (e.g. $aact_hmlg_)', async () => {
      const { createIntegration } = await import('./asaasIntegration.service.js');
      validateApiKeyMock.mockResolvedValueOnce(true);
      registerWebhookMock.mockResolvedValueOnce({ asaasWebhookId: 'wh_2' });
      createIntegrationMock.mockResolvedValueOnce(sampleRecord({ environment: 'sandbox' }));

      await createIntegration(TENANT_ID, { apiKey: '$aact_hmlg_real-key-value' });

      expect(validateApiKeyMock).toHaveBeenCalledWith('$aact_hmlg_real-key-value', 'sandbox');
      expect(createIntegrationMock).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ environment: 'sandbox' }),
      );
    });

    it('persists an encrypted apiKey (apiKeyEnc), never the plaintext key, in the repository call', async () => {
      const { createIntegration } = await import('./asaasIntegration.service.js');
      const plainKey = '$aact_hmlg_super-secret-plaintext';
      validateApiKeyMock.mockResolvedValueOnce(true);
      registerWebhookMock.mockResolvedValueOnce({ asaasWebhookId: 'wh_3' });
      createIntegrationMock.mockResolvedValueOnce(sampleRecord());

      await createIntegration(TENANT_ID, { apiKey: plainKey });

      const persistedData = createIntegrationMock.mock.calls[0][1] as { apiKeyEnc: unknown };
      expect(persistedData.apiKeyEnc).not.toBe(plainKey);
      expect(JSON.stringify(persistedData.apiKeyEnc)).not.toContain(plainKey);
      expect(persistedData.apiKeyEnc).toMatchObject({
        ciphertext: expect.any(String),
        iv: expect.any(String),
        authTag: expect.any(String),
      });
    });

    it('persists webhookAuthTokenHash as the exact sha256 of the generated authToken passed to registerWebhook (never the raw token)', async () => {
      const { createIntegration } = await import('./asaasIntegration.service.js');
      validateApiKeyMock.mockResolvedValueOnce(true);
      registerWebhookMock.mockResolvedValueOnce({ asaasWebhookId: 'wh_4' });
      createIntegrationMock.mockResolvedValueOnce(sampleRecord());

      await createIntegration(TENANT_ID, { apiKey: '$aact_hmlg_key' });

      const usedAuthToken = registerWebhookMock.mock.calls[0][3] as string;
      const persistedData = createIntegrationMock.mock.calls[0][1] as { webhookAuthTokenHash: string };
      expect(persistedData.webhookAuthTokenHash).toBe(sha256(usedAuthToken));
      expect(persistedData.webhookAuthTokenHash).not.toBe(usedAuthToken);
    });

    it('builds the webhook URL from ASAAS_WEBHOOK_BASE_URL + the generated webhookToken', async () => {
      const { createIntegration } = await import('./asaasIntegration.service.js');
      validateApiKeyMock.mockResolvedValueOnce(true);
      registerWebhookMock.mockResolvedValueOnce({ asaasWebhookId: 'wh_5' });
      createIntegrationMock.mockResolvedValueOnce(sampleRecord());

      await createIntegration(TENANT_ID, { apiKey: '$aact_hmlg_key' });

      const usedUrl = registerWebhookMock.mock.calls[0][2] as string;
      const persistedData = createIntegrationMock.mock.calls[0][1] as { webhookToken: string };
      expect(usedUrl).toBe(`${env.ASAAS_WEBHOOK_BASE_URL}/webhooks/asaas/${persistedData.webhookToken}`);
    });

    it('propagates a webhook-registration failure without persisting anything (no partial state)', async () => {
      const { createIntegration } = await import('./asaasIntegration.service.js');
      validateApiKeyMock.mockResolvedValueOnce(true);
      registerWebhookMock.mockRejectedValueOnce(new Error('Asaas unreachable'));

      await expect(createIntegration(TENANT_ID, { apiKey: '$aact_hmlg_key' })).rejects.toThrow('Asaas unreachable');

      expect(createIntegrationMock).not.toHaveBeenCalled();
    });

    it('returns the created integration with a masked apiKey, never the plaintext', async () => {
      const { createIntegration } = await import('./asaasIntegration.service.js');
      validateApiKeyMock.mockResolvedValueOnce(true);
      registerWebhookMock.mockResolvedValueOnce({ asaasWebhookId: 'wh_6' });
      createIntegrationMock.mockResolvedValueOnce(
        sampleRecord({ apiKeyEnc: encrypt('$aact_hmlg_plaintext-key-1234', ENC_KEY) }),
      );

      const result = await createIntegration(TENANT_ID, { apiKey: '$aact_hmlg_plaintext-key-1234' });

      expect(result.apiKey).toBe('****1234');
      expect(result).not.toHaveProperty('apiKeyEnc');
    });
  });

  describe('getCurrentIntegration', () => {
    it('returns the masked apiKey (AC3), never the plaintext', async () => {
      const { getCurrentIntegration } = await import('./asaasIntegration.service.js');
      findByTenantMock.mockResolvedValueOnce(
        sampleRecord({ apiKeyEnc: encrypt('$aact_prod_another-plaintext-999', ENC_KEY), environment: 'production' }),
      );

      const result = await getCurrentIntegration(TENANT_ID);

      expect(result.apiKey).toBe('****-999');
      expect(result.environment).toBe('production');
      expect(result).not.toHaveProperty('apiKeyEnc');
    });

    it('throws a 404 CustomError when the tenant has no integration', async () => {
      const { getCurrentIntegration } = await import('./asaasIntegration.service.js');
      findByTenantMock.mockResolvedValueOnce(null);

      await expect(getCurrentIntegration(TENANT_ID)).rejects.toMatchObject({ status: 404 });
    });
  });
});
