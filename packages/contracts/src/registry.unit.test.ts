import { describe, expect, it } from 'vitest';
import { schemaRegistry, TENANT_FORBIDDEN_KEYS } from './registry.js';

describe('schemaRegistry', () => {
  // Corrigido por T25 (teste estrutural): idSchema e inviteTokenParamSchema
  // também são exports Zod de um *.schema.ts e precisam estar aqui — a
  // varredura de tests/structural/schema-registry.structural.test.ts falha
  // caso algum dos 10 saia da lista.
  it('registers exactly the 14 input schemas by name', () => {
    const names = schemaRegistry.map((entry) => entry.name).sort();
    expect(names).toEqual(
      [
        'acceptInviteSchema',
        'createInviteSchema',
        'provisionTenantSchema',
        'signinSchema',
        'idSchema',
        'inviteTokenParamSchema',
        'fieldDefSchema',
        'migrationActionSchema',
        'createFieldTemplateSchema',
        'bumpFieldTemplateSchema',
        'createCustomerSchema',
        'createProcessSchema',
        'updateProcessValuesSchema',
        'updateProcessStageSchema',
      ].sort(),
    );
  });
});

describe('TENANT_FORBIDDEN_KEYS', () => {
  it('matches the exact list defined in design.md', () => {
    expect(TENANT_FORBIDDEN_KEYS).toEqual(['tenant', 'tenantid', 'tenant_id', 'orgid', 'org_id', 'clinic', 'company']);
  });
});
