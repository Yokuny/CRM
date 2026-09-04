import { describe, expect, it } from 'vitest';
import { createCustomerSchema } from './createCustomer.schema.js';

describe('createCustomerSchema', () => {
  it('accepts name, phone, document and values together', () => {
    const result = createCustomerSchema.safeParse({
      name: 'Maria Silva',
      phone: '(11) 91234-5678',
      document: '123.456.789-00',
      values: { status: 'novo' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Maria Silva');
      expect(result.data.phone).toBe('(11) 91234-5678');
      expect(result.data.document).toBe('123.456.789-00');
      expect(result.data.values).toEqual({ status: 'novo' });
    }
  });

  it('accepts a body with no document and no values (both optional)', () => {
    const result = createCustomerSchema.safeParse({ name: 'Maria Silva', phone: '11912345678' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.document).toBeUndefined();
      expect(result.data.values).toBeUndefined();
    }
  });

  it('rejects a missing name', () => {
    const result = createCustomerSchema.safeParse({ phone: '11912345678' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'name')).toBe(true);
    }
  });

  it('rejects a missing phone', () => {
    const result = createCustomerSchema.safeParse({ name: 'Maria Silva' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'phone')).toBe(true);
    }
  });

  it('accepts values as an arbitrary object shape — deep validation is runtime, not static', () => {
    const result = createCustomerSchema.safeParse({
      name: 'Maria Silva',
      phone: '11912345678',
      values: { status: 'novo', nested: { any: ['shape', 1, true] } },
    });
    expect(result.success).toBe(true);
  });

  it('rejects every tenant-forging key in the body', () => {
    for (const forged of ['Tenant', 'tenantId', 'orgId']) {
      const result = createCustomerSchema.safeParse({
        name: 'Maria Silva',
        phone: '11912345678',
        [forged]: 'forjado',
      });
      expect(result.success, `${forged} deveria ser rejeitado`).toBe(false);
    }
  });
});
