import { describe, expect, it } from 'vitest';
import { reorderColumnsSchema } from './reorderColumns.schema.js';

const validId = '507f1f77bcf86cd799439011';
const validId2 = '507f1f77bcf86cd799439012';

describe('reorderColumnsSchema (KAN-09)', () => {
  it('accepts a valid array of column ids', () => {
    const result = reorderColumnsSchema.safeParse({ columnIds: [validId, validId2] });

    expect(result.success).toBe(true);
  });

  it('rejects an empty columnIds array', () => {
    const result = reorderColumnsSchema.safeParse({ columnIds: [] });

    expect(result.success).toBe(false);
  });

  it('rejects a columnIds array with an invalid id', () => {
    const result = reorderColumnsSchema.safeParse({ columnIds: ['not-an-id'] });

    expect(result.success).toBe(false);
  });

  it('rejects a payload missing columnIds', () => {
    const result = reorderColumnsSchema.safeParse({});

    expect(result.success).toBe(false);
  });
});
