import { describe, expect, it } from 'vitest';
import { updateCardSchema } from './updateCard.schema.js';

const validId = '507f1f77bcf86cd799439011';

describe('updateCardSchema (KAN-16, KAN-17)', () => {
  it('accepts a partial update with only title', () => {
    const result = updateCardSchema.safeParse({ title: 'Novo título' });

    expect(result.success).toBe(true);
  });

  it('accepts a partial update with only a reference (KAN-17)', () => {
    const result = updateCardSchema.safeParse({ customer: validId });

    expect(result.success).toBe(true);
  });

  it('accepts an empty object (no field changed)', () => {
    const result = updateCardSchema.safeParse({});

    expect(result.success).toBe(true);
  });

  it('rejects a payload carrying `column` — never accepted, KAN-16 enforced at the contract level', () => {
    const result = updateCardSchema.safeParse({ column: validId });

    expect(result.success).toBe(false);
  });

  it('rejects a payload carrying `position` — never existed in createCardSchema either', () => {
    const result = updateCardSchema.safeParse({ position: 2 });

    expect(result.success).toBe(false);
  });
});
