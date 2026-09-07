import { describe, expect, it } from 'vitest';
import { setProcessFieldsInputSchema } from './setProcessFieldsInput.schema.js';

const validProcessId = '507f1f77bcf86cd799439011';

describe('setProcessFieldsInputSchema', () => {
  it('accepts processId and values together', () => {
    const result = setProcessFieldsInputSchema.safeParse({
      processId: validProcessId,
      values: { status: 'em_andamento' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing processId', () => {
    const result = setProcessFieldsInputSchema.safeParse({ values: { status: 'em_andamento' } });
    expect(result.success).toBe(false);
  });

  it('rejects a missing values', () => {
    const result = setProcessFieldsInputSchema.safeParse({ processId: validProcessId });
    expect(result.success).toBe(false);
  });

  it('rejects every tenant/channel/conversation forging key alongside a valid body', () => {
    for (const forged of ['Tenant', 'tenantId', 'orgId', 'channelId', 'conversationId']) {
      const result = setProcessFieldsInputSchema.safeParse({
        processId: validProcessId,
        values: { status: 'em_andamento' },
        [forged]: 'forjado',
      });
      expect(result.success, `${forged} deveria ser rejeitado`).toBe(false);
    }
  });
});
