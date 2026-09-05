import { describe, expect, it } from 'vitest';
import { createProcessSchema } from './createProcess.schema.js';

const VALID_CUSTOMER_ID = '507f1f77bcf86cd799439011';

describe('createProcessSchema', () => {
  it('accepts templateKey, customerId and values together', () => {
    const result = createProcessSchema.safeParse({
      templateKey: 'compra',
      customerId: VALID_CUSTOMER_ID,
      values: { urgencia: 'alta' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.templateKey).toBe('compra');
      expect(result.data.customerId).toBe(VALID_CUSTOMER_ID);
      expect(result.data.values).toEqual({ urgencia: 'alta' });
    }
  });

  it('accepts a body with no values (defaults applied server-side)', () => {
    const result = createProcessSchema.safeParse({ templateKey: 'compra', customerId: VALID_CUSTOMER_ID });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.values).toBeUndefined();
    }
  });

  it('rejects a missing templateKey', () => {
    const result = createProcessSchema.safeParse({ customerId: VALID_CUSTOMER_ID });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'templateKey')).toBe(true);
    }
  });

  it('rejects a missing customerId', () => {
    const result = createProcessSchema.safeParse({ templateKey: 'compra' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'customerId')).toBe(true);
    }
  });

  it('rejects a malformed customerId (not 24-hex)', () => {
    const result = createProcessSchema.safeParse({ templateKey: 'compra', customerId: 'not-a-valid-id' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'customerId')).toBe(true);
    }
  });

  it('rejects every tenant-forging key in the body', () => {
    for (const forged of ['Tenant', 'tenantId', 'orgId']) {
      const result = createProcessSchema.safeParse({
        templateKey: 'compra',
        customerId: VALID_CUSTOMER_ID,
        [forged]: 'forjado',
      });
      expect(result.success, `${forged} deveria ser rejeitado`).toBe(false);
    }
  });
});
