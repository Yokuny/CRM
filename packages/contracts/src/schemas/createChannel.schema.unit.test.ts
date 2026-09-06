import { describe, expect, it } from 'vitest';
import { createChannelSchema } from './createChannel.schema.js';

describe('createChannelSchema', () => {
  it('accepts phoneNumberId, wabaId, displayPhoneNumber and accessToken together', () => {
    const result = createChannelSchema.safeParse({
      phoneNumberId: '150000000',
      wabaId: '987654321',
      displayPhoneNumber: '+55 11 91234-5678',
      accessToken: 'EAAG-token-da-meta',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.phoneNumberId).toBe('150000000');
      expect(result.data.accessToken).toBe('EAAG-token-da-meta');
    }
  });

  it('accepts a body with only phoneNumberId and accessToken (wabaId/displayPhoneNumber optional)', () => {
    const result = createChannelSchema.safeParse({
      phoneNumberId: '150000000',
      accessToken: 'EAAG-token-da-meta',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing phoneNumberId', () => {
    const result = createChannelSchema.safeParse({ accessToken: 'EAAG-token-da-meta' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'phoneNumberId')).toBe(true);
    }
  });

  it('rejects a missing accessToken', () => {
    const result = createChannelSchema.safeParse({ phoneNumberId: '150000000' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'accessToken')).toBe(true);
    }
  });

  it('rejects every tenant-forging key in the body', () => {
    for (const forged of ['Tenant', 'tenantId', 'orgId']) {
      const result = createChannelSchema.safeParse({
        phoneNumberId: '150000000',
        accessToken: 'EAAG-token-da-meta',
        [forged]: 'forjado',
      });
      expect(result.success, `${forged} deveria ser rejeitado`).toBe(false);
    }
  });
});
