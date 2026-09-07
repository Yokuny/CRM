import { describe, expect, it } from 'vitest';
import { findOrCreateCustomerInputSchema } from './findOrCreateCustomerInput.schema.js';

describe('findOrCreateCustomerInputSchema', () => {
  it('accepts phone alone (name/document optional)', () => {
    const result = findOrCreateCustomerInputSchema.safeParse({ phone: '11912345678' });
    expect(result.success).toBe(true);
  });

  it('accepts name, phone and document together', () => {
    const result = findOrCreateCustomerInputSchema.safeParse({
      name: 'Maria Silva',
      phone: '11912345678',
      document: '12345678900',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing phone', () => {
    const result = findOrCreateCustomerInputSchema.safeParse({ name: 'Maria Silva' });
    expect(result.success).toBe(false);
  });

  it('rejects every tenant/channel/conversation forging key alongside a valid phone', () => {
    for (const forged of ['Tenant', 'tenantId', 'orgId', 'channelId', 'conversationId']) {
      const result = findOrCreateCustomerInputSchema.safeParse({ phone: '11912345678', [forged]: 'forjado' });
      expect(result.success, `${forged} deveria ser rejeitado`).toBe(false);
    }
  });
});
