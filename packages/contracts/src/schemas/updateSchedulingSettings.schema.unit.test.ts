import { describe, expect, it } from 'vitest';
import { updateSchedulingSettingsSchema } from './updateSchedulingSettings.schema.js';

describe('updateSchedulingSettingsSchema (SCH-06)', () => {
  it('accepts a value within 1..50', () => {
    expect(updateSchedulingSettingsSchema.safeParse({ maxSlotsPerResponse: 1 }).success).toBe(true);
    expect(updateSchedulingSettingsSchema.safeParse({ maxSlotsPerResponse: 50 }).success).toBe(true);
    expect(updateSchedulingSettingsSchema.safeParse({ maxSlotsPerResponse: 10 }).success).toBe(true);
  });

  it('rejects 0 and 51 (out of the 1..50 range)', () => {
    expect(updateSchedulingSettingsSchema.safeParse({ maxSlotsPerResponse: 0 }).success).toBe(false);
    expect(updateSchedulingSettingsSchema.safeParse({ maxSlotsPerResponse: 51 }).success).toBe(false);
  });

  it('rejects a non-integer value', () => {
    expect(updateSchedulingSettingsSchema.safeParse({ maxSlotsPerResponse: 10.5 }).success).toBe(false);
  });

  it('rejects a missing maxSlotsPerResponse', () => {
    expect(updateSchedulingSettingsSchema.safeParse({}).success).toBe(false);
  });

  it('rejects every tenant-forging key in the body (AD-010, .strict())', () => {
    for (const forged of ['Tenant', 'tenantId', 'orgId']) {
      const result = updateSchedulingSettingsSchema.safeParse({ maxSlotsPerResponse: 16, [forged]: 'forjado' });
      expect(result.success, `${forged} deveria ser rejeitado`).toBe(false);
    }
  });
});
