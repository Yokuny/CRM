import { describe, expect, it } from 'vitest';
import { updateColumnSchema } from './updateColumn.schema.js';

describe('updateColumnSchema (KAN-08, KAN-29)', () => {
  it('accepts a partial update with only label (rename, KAN-08)', () => {
    const result = updateColumnSchema.safeParse({ label: 'Novo nome' });

    expect(result.success).toBe(true);
  });

  it('accepts a partial update with only color (KAN-29)', () => {
    const result = updateColumnSchema.safeParse({ color: '#123ABC' });

    expect(result.success).toBe(true);
  });

  it('rejects an invalid color when provided', () => {
    const result = updateColumnSchema.safeParse({ color: 'blue' });

    expect(result.success).toBe(false);
  });

  it('rejects an empty label when provided', () => {
    const result = updateColumnSchema.safeParse({ label: '' });

    expect(result.success).toBe(false);
  });
});
