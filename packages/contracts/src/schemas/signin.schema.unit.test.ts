import { describe, expect, it } from 'vitest';
import { signinSchema } from './signin.schema.js';

describe('signinSchema', () => {
  it('accepts a valid email and password, lowercasing the email', () => {
    const result = signinSchema.safeParse({
      email: 'User@Example.com',
      password: 'anything',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('user@example.com');
    }
  });

  it('rejects a forged tenant field instead of silently dropping it', () => {
    const result = signinSchema.safeParse({
      email: 'user@example.com',
      password: 'anything',
      tenant: 'forged-tenant-id',
    });
    expect(result.success).toBe(false);
  });
});
