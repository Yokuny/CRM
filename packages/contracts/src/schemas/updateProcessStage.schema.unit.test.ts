import { describe, expect, it } from 'vitest';
import { updateProcessStageSchema } from './updateProcessStage.schema.js';

describe('updateProcessStageSchema', () => {
  it('accepts a non-empty stage value', () => {
    const result = updateProcessStageSchema.safeParse({ stage: 'aguardando_pagamento' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stage).toBe('aguardando_pagamento');
    }
  });

  it('rejects a missing stage', () => {
    const result = updateProcessStageSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'stage')).toBe(true);
    }
  });

  it('rejects an empty-string stage', () => {
    const result = updateProcessStageSchema.safeParse({ stage: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'stage')).toBe(true);
    }
  });

  it('rejects every tenant-forging key in the body', () => {
    for (const forged of ['Tenant', 'tenantId', 'orgId']) {
      const result = updateProcessStageSchema.safeParse({ stage: 'pago', [forged]: 'forjado' });
      expect(result.success, `${forged} deveria ser rejeitado`).toBe(false);
    }
  });
});
