import type { UpdateSchedulingSettings } from '@crm/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SchedulingSettingsRecord } from '../repositories/schedulingSettings.repository.js';

const getByTenantMock = vi.fn();
const upsertMock = vi.fn();

vi.mock('../repositories/schedulingSettings.repository.js', () => ({
  getByTenant: (...args: unknown[]) => getByTenantMock(...args),
  upsert: (...args: unknown[]) => upsertMock(...args),
}));

const TENANT_ID = 'tenant-1';

const sampleRecord = (overrides: Partial<SchedulingSettingsRecord> = {}): SchedulingSettingsRecord => ({
  id: 'settings-1',
  tenant: TENANT_ID,
  maxSlotsPerResponse: 10,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

describe('schedulingSettings.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSchedulingSettings (spec.md SCH-06)', () => {
    it('returns {maxSlotsPerResponse: 16} when no document exists for the tenant', async () => {
      const { getSchedulingSettings } = await import('./schedulingSettings.service.js');
      getByTenantMock.mockResolvedValueOnce(null);

      const result = await getSchedulingSettings(TENANT_ID);

      expect(result).toEqual({ maxSlotsPerResponse: 16 });
    });

    it('returns the repository record when one already exists', async () => {
      const { getSchedulingSettings } = await import('./schedulingSettings.service.js');
      const record = sampleRecord({ maxSlotsPerResponse: 25 });
      getByTenantMock.mockResolvedValueOnce(record);

      const result = await getSchedulingSettings(TENANT_ID);

      expect(result).toBe(record);
    });
  });

  describe('updateSchedulingSettings', () => {
    it('calls the repository upsert with the tenant-scoped value and returns its result', async () => {
      const { updateSchedulingSettings } = await import('./schedulingSettings.service.js');
      const record = sampleRecord({ maxSlotsPerResponse: 10 });
      upsertMock.mockResolvedValueOnce(record);
      const input: UpdateSchedulingSettings = { maxSlotsPerResponse: 10 };

      const result = await updateSchedulingSettings(TENANT_ID, input);

      expect(upsertMock).toHaveBeenCalledWith(TENANT_ID, { maxSlotsPerResponse: 10 });
      expect(result).toBe(record);
    });
  });
});
