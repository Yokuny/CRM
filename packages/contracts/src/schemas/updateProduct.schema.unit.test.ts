import { describe, expect, it } from 'vitest';
import { updateProductSchema } from './updateProduct.schema.js';

describe('updateProductSchema', () => {
  it('accepts a partial update with just stock (spec.md AC3: "incluindo stock/active")', () => {
    const result = updateProductSchema.safeParse({ stock: 20 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ stock: 20 });
    }
  });

  it('accepts a partial update with just active (spec.md AC3)', () => {
    const result = updateProductSchema.safeParse({ active: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ active: false });
    }
  });

  it('accepts an empty body — every field is optional', () => {
    const result = updateProductSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects a negative price when provided (spec.md AC4)', () => {
    const result = updateProductSchema.safeParse({ price: -1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'price')).toBe(true);
    }
  });

  it('rejects a negative stock when provided (spec.md AC4)', () => {
    const result = updateProductSchema.safeParse({ stock: -1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'stock')).toBe(true);
    }
  });

  it('rejects an empty name when provided (spec.md AC4: "name está ausente/vazio")', () => {
    const result = updateProductSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'name')).toBe(true);
    }
  });

  it('rejects every tenant-forging key in the body (AD-010, .strict())', () => {
    for (const forged of ['Tenant', 'tenantId', 'orgId']) {
      const result = updateProductSchema.safeParse({ stock: 5, [forged]: 'forjado' });
      expect(result.success, `${forged} deveria ser rejeitado`).toBe(false);
    }
  });
});
