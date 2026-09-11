import crypto from 'node:crypto';
import { connect, disconnect, SchedulingSettings } from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import * as schedulingSettingsRepository from './schedulingSettings.repository.js';

// Sem `mongoose` aqui (AD-010/boundary estrutural: só packages/db importa
// mongoose) — mesmo padrão de asaasIntegration.repository.int.test.ts.
const randomId = (): string => crypto.randomBytes(12).toString('hex');

describe('schedulingSettings.repository', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
  });

  afterEach(async () => {
    await SchedulingSettings.deleteMany({});
  });

  afterAll(async () => {
    await disconnect();
  });

  describe('getByTenant', () => {
    it('returns null when no document exists yet for the tenant (spec.md SCH-06)', async () => {
      const tenantId = randomId();

      const result = await schedulingSettingsRepository.getByTenant(tenantId);

      expect(result).toBeNull();
    });

    it('returns the document scoped to the tenant when one exists', async () => {
      const tenantId = randomId();
      await schedulingSettingsRepository.upsert(tenantId, { maxSlotsPerResponse: 10 });

      const result = await schedulingSettingsRepository.getByTenant(tenantId);

      expect(result?.maxSlotsPerResponse).toBe(10);
    });

    it("never returns another tenant's document (AD-010)", async () => {
      const owner = randomId();
      const intruder = randomId();
      await schedulingSettingsRepository.upsert(owner, { maxSlotsPerResponse: 10 });

      const result = await schedulingSettingsRepository.getByTenant(intruder);

      expect(result).toBeNull();
    });
  });

  describe('upsert', () => {
    it('creates the document on the first call for a tenant', async () => {
      const tenantId = randomId();

      const result = await schedulingSettingsRepository.upsert(tenantId, { maxSlotsPerResponse: 10 });

      expect(result.maxSlotsPerResponse).toBe(10);
      expect(await SchedulingSettings.countDocuments({})).toBe(1);
    });

    it('updates the SAME document on a second call for the same tenant (spec.md SCH-06)', async () => {
      const tenantId = randomId();
      const created = await schedulingSettingsRepository.upsert(tenantId, { maxSlotsPerResponse: 10 });

      const updated = await schedulingSettingsRepository.upsert(tenantId, { maxSlotsPerResponse: 25 });

      expect(await SchedulingSettings.countDocuments({})).toBe(1);
      expect(updated.id).toBe(created.id);
      expect(updated.maxSlotsPerResponse).toBe(25);
    });
  });
});
