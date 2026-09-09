import { describe, expect, it } from 'vitest';
import { rejectOrderSchema } from './rejectOrder.schema.js';

describe('rejectOrderSchema', () => {
  it('accepts a body with reason (spec.md AC6: "com reason opcional")', () => {
    const result = rejectOrderSchema.safeParse({ reason: 'cliente desistiu' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reason).toBe('cliente desistiu');
    }
  });

  it('accepts an empty body — reason is optional (spec.md AC6)', () => {
    const result = rejectOrderSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reason).toBeUndefined();
    }
  });

  it('rejects a non-string reason', () => {
    const result = rejectOrderSchema.safeParse({ reason: 123 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'reason')).toBe(true);
    }
  });

  it('rejects every tenant-forging key in the body (AD-010, .strict())', () => {
    for (const forged of ['Tenant', 'tenantId', 'orgId']) {
      const result = rejectOrderSchema.safeParse({ reason: 'motivo', [forged]: 'forjado' });
      expect(result.success, `${forged} deveria ser rejeitado`).toBe(false);
    }
  });
});
