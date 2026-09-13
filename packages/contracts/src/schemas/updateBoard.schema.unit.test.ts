import { describe, expect, it } from 'vitest';
import { updateBoardSchema } from './updateBoard.schema.js';

describe('updateBoardSchema (KAN-04)', () => {
  it('accepts an update with only description (name unchanged)', () => {
    const result = updateBoardSchema.safeParse({ description: 'Nova descrição' });

    expect(result.success).toBe(true);
  });

  it('accepts an update with only name', () => {
    const result = updateBoardSchema.safeParse({ name: 'Novo nome' });

    expect(result.success).toBe(true);
  });

  it('accepts an empty object (no field changed)', () => {
    const result = updateBoardSchema.safeParse({});

    expect(result.success).toBe(true);
  });

  it('rejects a name shorter than 3 characters when provided', () => {
    const result = updateBoardSchema.safeParse({ name: 'ab' });

    expect(result.success).toBe(false);
  });

  it('rejects an unknown field, e.g. columns (columns change via column routes, T4)', () => {
    const result = updateBoardSchema.safeParse({ columns: [{ label: 'A fazer' }] });

    expect(result.success).toBe(false);
  });
});
