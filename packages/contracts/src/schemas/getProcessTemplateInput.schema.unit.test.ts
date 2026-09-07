import { describe, expect, it } from 'vitest';
import { getProcessTemplateInputSchema } from './getProcessTemplateInput.schema.js';

describe('getProcessTemplateInputSchema', () => {
  it('accepts a valid {key}', () => {
    const result = getProcessTemplateInputSchema.safeParse({ key: 'onboarding' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.key).toBe('onboarding');
    }
  });

  it('rejects a missing key', () => {
    const result = getProcessTemplateInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects every tenant/channel/conversation forging key alongside a valid key', () => {
    for (const forged of ['Tenant', 'tenantId', 'orgId', 'channelId', 'conversationId']) {
      const result = getProcessTemplateInputSchema.safeParse({ key: 'onboarding', [forged]: 'forjado' });
      expect(result.success, `${forged} deveria ser rejeitado`).toBe(false);
    }
  });
});
