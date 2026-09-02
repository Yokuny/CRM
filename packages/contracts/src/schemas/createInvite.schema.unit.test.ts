import { describe, expect, it } from 'vitest';
import { createInviteSchema } from './createInvite.schema.js';

describe('createInviteSchema', () => {
  it('accepts a valid email and role, lowercasing the email', () => {
    const result = createInviteSchema.safeParse({
      email: 'Convidado@Empresa.com',
      role: 'admin',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('convidado@empresa.com');
    }
  });

  it('rejects a forged orgId field instead of silently dropping it', () => {
    const result = createInviteSchema.safeParse({
      email: 'convidado@empresa.com',
      role: 'admin',
      orgId: 'forged-org-id',
    });
    expect(result.success).toBe(false);
  });
});
