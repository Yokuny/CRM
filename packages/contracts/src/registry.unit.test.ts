import { describe, expect, it } from 'vitest';
import { schemaRegistry, TENANT_FORBIDDEN_KEYS } from './registry.js';

describe('schemaRegistry', () => {
  it('registers exactly the 4 input schemas by name', () => {
    const names = schemaRegistry.map((entry) => entry.name).sort();
    expect(names).toEqual(['acceptInviteSchema', 'createInviteSchema', 'provisionTenantSchema', 'signinSchema'].sort());
  });
});

describe('TENANT_FORBIDDEN_KEYS', () => {
  it('matches the exact list defined in design.md', () => {
    expect(TENANT_FORBIDDEN_KEYS).toEqual(['tenant', 'tenantid', 'tenant_id', 'orgid', 'org_id', 'clinic', 'company']);
  });
});
