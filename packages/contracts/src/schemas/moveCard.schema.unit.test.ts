import { describe, expect, it } from 'vitest';
import { moveCardSchema } from './moveCard.schema.js';

const validId = '507f1f77bcf86cd799439011';

describe('moveCardSchema (KAN-18, KAN-19, KAN-21)', () => {
  it('accepts a valid column + position payload', () => {
    const result = moveCardSchema.safeParse({ column: validId, position: 0 });

    expect(result.success).toBe(true);
  });

  it('rejects a negative position', () => {
    const result = moveCardSchema.safeParse({ column: validId, position: -1 });

    expect(result.success).toBe(false);
  });

  it('rejects a non-integer position', () => {
    const result = moveCardSchema.safeParse({ column: validId, position: 1.5 });

    expect(result.success).toBe(false);
  });

  it('rejects a missing column', () => {
    const result = moveCardSchema.safeParse({ position: 0 });

    expect(result.success).toBe(false);
  });
});
