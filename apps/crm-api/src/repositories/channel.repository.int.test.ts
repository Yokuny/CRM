import crypto from 'node:crypto';
import { Channel, connect, disconnect } from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import * as channelRepository from './channel.repository.js';

// Sem `mongoose` aqui (AD-010/boundary estrutural: só packages/db importa
// mongoose) — mesmo padrão de customer.repository.int.test.ts.
const randomId = (): string => crypto.randomBytes(12).toString('hex');

const ENC = { ciphertext: 'c', iv: 'i', authTag: 'a' };

describe('channel.repository', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
    await Channel.init();
  });

  afterEach(async () => {
    await Channel.deleteMany({});
  });

  afterAll(async () => {
    await disconnect();
  });

  describe('createChannel', () => {
    it('persists Tenant from the tenantId parameter, never from a second Tenant key forged inside data (AIG-01/03)', async () => {
      const tenantId = randomId();
      const otherTenantId = randomId();
      // `data` forjado com uma chave Tenant estranha — não existe no tipo
      // CreateChannelData, então só chega aqui via cast (mesma técnica de
      // teste usada para provar `.strict()` na camada de router).
      const forgedData: Record<string, unknown> = {
        phoneNumberId: randomId(),
        accessTokenEnc: ENC,
        Tenant: otherTenantId,
      };

      const result = await channelRepository.createChannel(
        tenantId,
        forgedData as unknown as channelRepository.CreateChannelData,
      );

      expect(result.tenant).toBe(tenantId);
      const persisted = await Channel.findById(result.id).lean();
      expect(persisted?.Tenant.toString()).toBe(tenantId);
    });

    it('rejects a duplicate phoneNumberId across tenants with a propagated duplicate-key error (AIG-02)', async () => {
      const phoneNumberId = randomId();
      await channelRepository.createChannel(randomId(), { phoneNumberId, accessTokenEnc: ENC });

      await expect(
        channelRepository.createChannel(randomId(), { phoneNumberId, accessTokenEnc: ENC }),
      ).rejects.toMatchObject({ code: 11000 });
      expect(await Channel.countDocuments({ phoneNumberId })).toBe(1);
    });
  });

  describe('findByPhoneNumberId', () => {
    it('resolves the right Channel cross-tenant — the webhook resolver never filters by Tenant (AD-010 exception)', async () => {
      const tenantA = randomId();
      const tenantB = randomId();
      await channelRepository.createChannel(tenantA, { phoneNumberId: randomId(), accessTokenEnc: ENC });
      const phoneNumberIdB = randomId();
      const created = await channelRepository.createChannel(tenantB, {
        phoneNumberId: phoneNumberIdB,
        accessTokenEnc: ENC,
      });

      const result = await channelRepository.findByPhoneNumberId(phoneNumberIdB);

      expect(result?.id).toBe(created.id);
      expect(result?.tenant).toBe(tenantB);
    });

    it('returns null for a phoneNumberId with no matching Channel', async () => {
      const result = await channelRepository.findByPhoneNumberId(randomId());
      expect(result).toBeNull();
    });
  });

  describe('findByTenant', () => {
    it("never returns another tenant's Channel (AD-010)", async () => {
      const tenantA = randomId();
      const tenantB = randomId();
      await channelRepository.createChannel(tenantA, { phoneNumberId: randomId(), accessTokenEnc: ENC });
      const createdB = await channelRepository.createChannel(tenantB, {
        phoneNumberId: randomId(),
        accessTokenEnc: ENC,
      });

      const result = await channelRepository.findByTenant(tenantB);

      expect(result?.id).toBe(createdB.id);
      expect(result?.tenant).toBe(tenantB);
    });

    it('returns null when the tenant has no Channel yet', async () => {
      const result = await channelRepository.findByTenant(randomId());
      expect(result).toBeNull();
    });
  });
});
