import { describe, expect, it } from 'vitest';
import { createCardSchema } from './createCard.schema.js';

const validId = '507f1f77bcf86cd799439011';
const validId2 = '507f1f77bcf86cd799439012';
const validId3 = '507f1f77bcf86cd799439013';
const validId4 = '507f1f77bcf86cd799439014';

describe('createCardSchema (KAN-13, KAN-14, KAN-15)', () => {
  it('accepts a card with only title and column (KAN-13, card 100% livre)', () => {
    const result = createCardSchema.safeParse({ column: validId, title: 'Ligar para o cliente' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.customer).toBeUndefined();
      expect(result.data.process).toBeUndefined();
      expect(result.data.order).toBeUndefined();
      expect(result.data.assignee).toBeUndefined();
    }
  });

  it('accepts a card with all 4 optional references filled (KAN-14)', () => {
    const result = createCardSchema.safeParse({
      column: validId,
      title: 'Ligar para o cliente',
      customer: validId2,
      process: validId3,
      order: validId4,
      assignee: validId,
    });

    expect(result.success).toBe(true);
  });

  it('rejects an empty title', () => {
    const result = createCardSchema.safeParse({ column: validId, title: '' });

    expect(result.success).toBe(false);
  });

  it('rejects a missing column (KAN-15)', () => {
    const result = createCardSchema.safeParse({ title: 'Sem coluna' });

    expect(result.success).toBe(false);
  });

  it('rejects a title longer than 120 characters', () => {
    const result = createCardSchema.safeParse({ column: validId, title: 'a'.repeat(121) });

    expect(result.success).toBe(false);
  });

  it('rejects a description longer than 2000 characters', () => {
    const result = createCardSchema.safeParse({
      column: validId,
      title: 'Ligar para o cliente',
      description: 'a'.repeat(2001),
    });

    expect(result.success).toBe(false);
  });

  it('treats an empty-string optional reference as "no reference" (spec.md Edge Cases)', () => {
    const result = createCardSchema.safeParse({
      column: validId,
      title: 'Ligar para o cliente',
      customer: '',
      process: '',
      order: '',
      assignee: '',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.customer).toBeUndefined();
      expect(result.data.process).toBeUndefined();
      expect(result.data.order).toBeUndefined();
      expect(result.data.assignee).toBeUndefined();
    }
  });

  it('rejects a malformed (non-empty, non-id) optional reference', () => {
    const result = createCardSchema.safeParse({ column: validId, title: 'Ligar para o cliente', customer: 'nope' });

    expect(result.success).toBe(false);
  });
});
