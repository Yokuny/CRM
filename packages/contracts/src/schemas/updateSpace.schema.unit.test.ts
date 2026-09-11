import { describe, expect, it } from 'vitest';
import { updateSpaceSchema } from './updateSpace.schema.js';

describe('updateSpaceSchema (SCH-04)', () => {
  it('accepts an empty partial payload', () => {
    expect(updateSpaceSchema.safeParse({}).success).toBe(true);
  });

  it('accepts only active', () => {
    const result = updateSpaceSchema.safeParse({ active: false });
    expect(result.success).toBe(true);
  });

  it('rejects an empty name when present', () => {
    expect(updateSpaceSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('rejects every tenant-forging key in the body (AD-010, .strict())', () => {
    for (const forged of ['Tenant', 'tenantId', 'orgId']) {
      const result = updateSpaceSchema.safeParse({ [forged]: 'forjado' });
      expect(result.success, `${forged} deveria ser rejeitado`).toBe(false);
    }
  });
});
