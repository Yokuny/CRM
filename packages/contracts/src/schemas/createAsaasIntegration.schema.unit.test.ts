import { describe, expect, it } from 'vitest';
import { createAsaasIntegrationSchema } from './createAsaasIntegration.schema.js';

describe('createAsaasIntegrationSchema (spec.md P1 "Tenant configura sua própria chave Asaas")', () => {
  it('accepts a well-formed sandbox key ($aact_hmlg_ prefix)', () => {
    const result = createAsaasIntegrationSchema.safeParse({ apiKey: '$aact_hmlg_000MzkwODA6OjllZmI3ZDk3LTBk' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.apiKey).toBe('$aact_hmlg_000MzkwODA6OjllZmI3ZDk3LTBk');
    }
  });

  it('accepts a well-formed production key ($aact_prod_ prefix)', () => {
    const result = createAsaasIntegrationSchema.safeParse({ apiKey: '$aact_prod_000MzkwODA6OjllZmI3ZDk3LTBk' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty apiKey', () => {
    const result = createAsaasIntegrationSchema.safeParse({ apiKey: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed key with no recognizable Asaas prefix', () => {
    const result = createAsaasIntegrationSchema.safeParse({ apiKey: 'not-an-asaas-key' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'apiKey')).toBe(true);
    }
  });

  it('rejects a key with the right prefix but too short a body (malformed)', () => {
    const result = createAsaasIntegrationSchema.safeParse({ apiKey: '$aact_prod_ab' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing apiKey field entirely', () => {
    const result = createAsaasIntegrationSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects every tenant-forging key in the body (Tenant always comes from the session, AD-010)', () => {
    for (const forged of ['Tenant', 'tenantId', 'orgId']) {
      const result = createAsaasIntegrationSchema.safeParse({
        apiKey: '$aact_hmlg_000MzkwODA6OjllZmI3ZDk3LTBk',
        [forged]: 'forjado',
      });
      expect(result.success, `${forged} deveria ser rejeitado`).toBe(false);
    }
  });
});
