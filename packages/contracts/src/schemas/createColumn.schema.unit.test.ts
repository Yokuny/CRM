import { describe, expect, it } from 'vitest';
import { createColumnSchema } from './createColumn.schema.js';

describe('createColumnSchema (KAN-07, KAN-29)', () => {
  it('accepts a valid payload with label and color', () => {
    const result = createColumnSchema.safeParse({ label: 'Em andamento', color: '#00AA00' });

    expect(result.success).toBe(true);
  });

  it('accepts a valid payload without color (KAN-29 is optional)', () => {
    const result = createColumnSchema.safeParse({ label: 'Em andamento' });

    expect(result.success).toBe(true);
  });

  it('rejects a payload missing label', () => {
    const result = createColumnSchema.safeParse({ color: '#00AA00' });

    expect(result.success).toBe(false);
  });

  it('rejects a label longer than 60 characters', () => {
    const result = createColumnSchema.safeParse({ label: 'a'.repeat(61) });

    expect(result.success).toBe(false);
  });

  it('rejects a color outside the #RRGGBB regex', () => {
    const result = createColumnSchema.safeParse({ label: 'Em andamento', color: 'not-a-color' });

    expect(result.success).toBe(false);
  });

  it('rejects an unknown field (.strict())', () => {
    const result = createColumnSchema.safeParse({ label: 'Em andamento', order: 3 });

    expect(result.success).toBe(false);
  });
});
