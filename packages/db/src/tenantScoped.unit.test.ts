import { describe, expect, it } from 'vitest';
import { tenantScoped } from './tenantScoped.js';

describe('tenantScoped', () => {
  it('returns the same filter object unchanged when Tenant is present', () => {
    const filter = { Tenant: 'tenant-1', status: 'active' };

    expect(tenantScoped(filter)).toBe(filter);
  });

  it('is a compile-time type error to call it without Tenant in the filter', () => {
    // @ts-expect-error - filtro sem Tenant precisa ser erro de tipo (AD-010)
    tenantScoped({ status: 'active' });
  });
});
