import { describe, expect, it } from 'vitest';
import { updateCustomerSchema } from './updateCustomer.schema.js';

describe('updateCustomerSchema', () => {
  it('accepts a full payload with name, phone, document and values', () => {
    const result = updateCustomerSchema.safeParse({
      name: 'Maria Silva',
      phone: '(11) 91234-5678',
      document: '123.456.789-00',
      values: { status: 'ativo' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Maria Silva');
      expect(result.data.phone).toBe('(11) 91234-5678');
      expect(result.data.document).toBe('123.456.789-00');
      expect(result.data.values).toEqual({ status: 'ativo' });
    }
  });

  it('accepts a values-only subset, as the kanban drag would send', () => {
    const result = updateCustomerSchema.safeParse({ values: { status: 'ativo' } });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBeUndefined();
      expect(result.data.values).toEqual({ status: 'ativo' });
    }
  });

  it('rejects an empty object via the non-empty refine', () => {
    const result = updateCustomerSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects a name over 120 characters', () => {
    const result = updateCustomerSchema.safeParse({ name: 'a'.repeat(121) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'name')).toBe(true);
    }
  });

  it('rejects a phone over 30 characters', () => {
    const result = updateCustomerSchema.safeParse({ phone: '1'.repeat(31) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'phone')).toBe(true);
    }
  });

  it('rejects values with a non-object shape', () => {
    const result = updateCustomerSchema.safeParse({ values: 'nao-e-objeto' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'values')).toBe(true);
    }
  });
});
