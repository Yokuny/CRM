import { describe, expect, it } from 'vitest';
import { openProcessInputSchema } from './openProcessInput.schema.js';

const validCustomerId = '507f1f77bcf86cd799439011';

describe('openProcessInputSchema', () => {
  it('accepts templateKey and customerId (values optional)', () => {
    const result = openProcessInputSchema.safeParse({ templateKey: 'onboarding', customerId: validCustomerId });
    expect(result.success).toBe(true);
  });

  it('accepts templateKey, customerId and values together', () => {
    const result = openProcessInputSchema.safeParse({
      templateKey: 'onboarding',
      customerId: validCustomerId,
      values: { status: 'novo' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing templateKey', () => {
    const result = openProcessInputSchema.safeParse({ customerId: validCustomerId });
    expect(result.success).toBe(false);
  });

  it('rejects a missing customerId', () => {
    const result = openProcessInputSchema.safeParse({ templateKey: 'onboarding' });
    expect(result.success).toBe(false);
  });

  it('rejects a customerId that is not a valid 24-hex id', () => {
    const result = openProcessInputSchema.safeParse({ templateKey: 'onboarding', customerId: 'not-an-id' });
    expect(result.success).toBe(false);
  });

  it('rejects every tenant/channel/conversation forging key alongside a valid body', () => {
    for (const forged of ['Tenant', 'tenantId', 'orgId', 'channelId', 'conversationId']) {
      const result = openProcessInputSchema.safeParse({
        templateKey: 'onboarding',
        customerId: validCustomerId,
        [forged]: 'forjado',
      });
      expect(result.success, `${forged} deveria ser rejeitado`).toBe(false);
    }
  });
});
