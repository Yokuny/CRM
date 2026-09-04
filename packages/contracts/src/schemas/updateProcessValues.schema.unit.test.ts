import { describe, expect, it } from 'vitest';
import { updateProcessValuesSchema } from './updateProcessValues.schema.js';

describe('updateProcessValuesSchema', () => {
  it('accepts an arbitrary values object', () => {
    const result = updateProcessValuesSchema.safeParse({
      values: { urgencia: 'alta', nested: { any: ['shape', 1, true] } },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.values).toEqual({ urgencia: 'alta', nested: { any: ['shape', 1, true] } });
    }
  });

  it('rejects a missing values key', () => {
    const result = updateProcessValuesSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'values')).toBe(true);
    }
  });

  it('rejects every tenant-forging key in the body', () => {
    for (const forged of ['Tenant', 'tenantId', 'orgId']) {
      const result = updateProcessValuesSchema.safeParse({ values: {}, [forged]: 'forjado' });
      expect(result.success, `${forged} deveria ser rejeitado`).toBe(false);
    }
  });
});
