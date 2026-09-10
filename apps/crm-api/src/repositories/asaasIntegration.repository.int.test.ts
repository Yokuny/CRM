import crypto from 'node:crypto';
import { AsaasIntegration, connect, disconnect } from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import * as asaasIntegrationRepository from './asaasIntegration.repository.js';

// Sem `mongoose` aqui (AD-010/boundary estrutural: só packages/db importa
// mongoose) — mesmo padrão de channel.repository.int.test.ts.
const randomId = (): string => crypto.randomBytes(12).toString('hex');
const randomToken = (): string => crypto.randomBytes(24).toString('hex');

const ENC = { ciphertext: 'c', iv: 'i', authTag: 'a' };

const sampleData = (overrides: Partial<asaasIntegrationRepository.CreateAsaasIntegrationData> = {}) => ({
  apiKeyEnc: ENC,
  environment: 'sandbox' as const,
  webhookToken: randomToken(),
  webhookAuthTokenHash: 'hash-value',
  ...overrides,
});

describe('asaasIntegration.repository', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
    await AsaasIntegration.init();
  });

  afterEach(async () => {
    await AsaasIntegration.deleteMany({});
  });

  afterAll(async () => {
    await disconnect();
  });

  describe('createIntegration', () => {
    it('persists Tenant from the tenantId parameter, never from a second Tenant key forged inside data (AIG-01/03 idiom)', async () => {
      const tenantId = randomId();
      const otherTenantId = randomId();
      const forgedData: Record<string, unknown> = {
        ...sampleData(),
        Tenant: otherTenantId,
      };

      const result = await asaasIntegrationRepository.createIntegration(
        tenantId,
        forgedData as unknown as asaasIntegrationRepository.CreateAsaasIntegrationData,
      );

      expect(result.tenant).toBe(tenantId);
      const persisted = await AsaasIntegration.findById(result.id).lean();
      expect(persisted?.Tenant.toString()).toBe(tenantId);
    });

    it('persists the encrypted key and environment, never a plaintext apiKey field (spec.md P1 AC1)', async () => {
      const tenantId = randomId();

      const result = await asaasIntegrationRepository.createIntegration(
        tenantId,
        sampleData({ environment: 'production' }),
      );

      expect(result.environment).toBe('production');
      expect(result).not.toHaveProperty('apiKey');
      const persisted = await AsaasIntegration.findById(result.id).lean();
      expect(persisted?.apiKeyEnc).toEqual(ENC);
    });

    it('rejects a second integration for a tenant that already has one (unique Tenant index)', async () => {
      const tenantId = randomId();
      await asaasIntegrationRepository.createIntegration(tenantId, sampleData());

      await expect(asaasIntegrationRepository.createIntegration(tenantId, sampleData())).rejects.toMatchObject({
        code: 11000,
      });
      expect(await AsaasIntegration.countDocuments({ Tenant: tenantId })).toBe(1);
    });

    it('rejects a duplicate webhookToken across tenants (unique webhookToken index)', async () => {
      const webhookToken = randomToken();
      await asaasIntegrationRepository.createIntegration(randomId(), sampleData({ webhookToken }));

      await expect(
        asaasIntegrationRepository.createIntegration(randomId(), sampleData({ webhookToken })),
      ).rejects.toMatchObject({ code: 11000 });
    });
  });

  describe('findByTenant', () => {
    it("never returns another tenant's AsaasIntegration (AD-010)", async () => {
      const tenantA = randomId();
      const tenantB = randomId();
      await asaasIntegrationRepository.createIntegration(tenantA, sampleData());
      const createdB = await asaasIntegrationRepository.createIntegration(tenantB, sampleData());

      const result = await asaasIntegrationRepository.findByTenant(tenantB);

      expect(result?.id).toBe(createdB.id);
      expect(result?.tenant).toBe(tenantB);
    });

    it('returns null when the tenant has no AsaasIntegration yet', async () => {
      const result = await asaasIntegrationRepository.findByTenant(randomId());
      expect(result).toBeNull();
    });
  });

  describe('findByWebhookToken', () => {
    it('resolves the right integration cross-tenant — the webhook resolver never filters by Tenant (AD-010 exception)', async () => {
      await asaasIntegrationRepository.createIntegration(randomId(), sampleData());
      const webhookToken = randomToken();
      const tenantB = randomId();
      const created = await asaasIntegrationRepository.createIntegration(tenantB, sampleData({ webhookToken }));

      const result = await asaasIntegrationRepository.findByWebhookToken(webhookToken);

      expect(result?.id).toBe(created.id);
      expect(result?.tenant).toBe(tenantB);
    });

    it('returns null for a webhookToken with no matching integration', async () => {
      const result = await asaasIntegrationRepository.findByWebhookToken(randomToken());
      expect(result).toBeNull();
    });
  });
});
