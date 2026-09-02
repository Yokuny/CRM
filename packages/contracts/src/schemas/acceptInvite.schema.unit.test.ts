import { describe, expect, it } from 'vitest';
import { acceptInviteSchema } from './acceptInvite.schema.js';

describe('acceptInviteSchema', () => {
  it('accepts a valid name and an 8+ character password', () => {
    const result = acceptInviteSchema.safeParse({
      name: 'Fulano Beltrano',
      password: 'password123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a forged tenantId field instead of silently dropping it', () => {
    const result = acceptInviteSchema.safeParse({
      name: 'Fulano Beltrano',
      password: 'password123',
      tenantId: 'forged-tenant-id',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a password below the 8-character minimum (spec P1-2/AC4)', () => {
    const result = acceptInviteSchema.safeParse({
      name: 'Fulano Beltrano',
      password: 'short12',
    });
    expect(result.success).toBe(false);
  });
});
