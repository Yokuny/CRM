import { describe, expect, it } from 'vitest';
import { createSpaceSchema } from './createSpace.schema.js';

describe('createSpaceSchema (SCH-04)', () => {
  it('accepts a valid name', () => {
    const result = createSpaceSchema.safeParse({ name: 'Sala 1' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty or whitespace-only name', () => {
    expect(createSpaceSchema.safeParse({ name: '' }).success).toBe(false);
    expect(createSpaceSchema.safeParse({ name: '   ' }).success).toBe(false);
  });

  it('rejects a missing name', () => {
    expect(createSpaceSchema.safeParse({}).success).toBe(false);
  });

  it('rejects every tenant-forging key in the body (AD-010, .strict())', () => {
    for (const forged of ['Tenant', 'tenantId', 'orgId']) {
      const result = createSpaceSchema.safeParse({ name: 'Sala 1', [forged]: 'forjado' });
      expect(result.success, `${forged} deveria ser rejeitado`).toBe(false);
    }
  });
});
