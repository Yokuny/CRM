import { describe, expect, it } from 'vitest';
import { createProductSchema } from './createProduct.schema.js';

describe('createProductSchema', () => {
  it('accepts the full payload: name, sku, description, price, stock and active together', () => {
    const result = createProductSchema.safeParse({
      name: 'Camiseta Azul',
      sku: 'CAM-AZ-M',
      description: 'Camiseta 100% algodão',
      price: 4990,
      stock: 10,
      active: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        name: 'Camiseta Azul',
        sku: 'CAM-AZ-M',
        description: 'Camiseta 100% algodão',
        price: 4990,
        stock: 10,
        active: false,
      });
    }
  });

  it('accepts only the required fields (name, price, stock) — sku/description/active omitted (spec.md AC1)', () => {
    const result = createProductSchema.safeParse({ name: 'Produto Mínimo', price: 1000, stock: 5 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sku).toBeUndefined();
      expect(result.data.description).toBeUndefined();
      expect(result.data.active).toBeUndefined();
    }
  });

  it('rejects a missing name', () => {
    const result = createProductSchema.safeParse({ price: 1000, stock: 5 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'name')).toBe(true);
    }
  });

  it('rejects an empty name (spec.md AC4: "name está ausente/vazio")', () => {
    const result = createProductSchema.safeParse({ name: '', price: 1000, stock: 5 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'name')).toBe(true);
    }
  });

  it('rejects a negative price (spec.md AC4: "price ou stock recebidos são negativos")', () => {
    const result = createProductSchema.safeParse({ name: 'Produto', price: -1, stock: 5 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'price')).toBe(true);
    }
  });

  it('rejects a negative stock (spec.md AC4)', () => {
    const result = createProductSchema.safeParse({ name: 'Produto', price: 1000, stock: -1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'stock')).toBe(true);
    }
  });

  it('rejects a non-integer price (design.md: price é inteiro em centavos)', () => {
    const result = createProductSchema.safeParse({ name: 'Produto', price: 10.5, stock: 5 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'price')).toBe(true);
    }
  });

  it('rejects a non-integer stock (design.md: stock é inteiro)', () => {
    const result = createProductSchema.safeParse({ name: 'Produto', price: 1000, stock: 5.5 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'stock')).toBe(true);
    }
  });

  it('rejects every tenant-forging key in the body (AD-010, .strict())', () => {
    for (const forged of ['Tenant', 'tenantId', 'orgId']) {
      const result = createProductSchema.safeParse({ name: 'Produto', price: 1000, stock: 5, [forged]: 'forjado' });
      expect(result.success, `${forged} deveria ser rejeitado`).toBe(false);
    }
  });
});
