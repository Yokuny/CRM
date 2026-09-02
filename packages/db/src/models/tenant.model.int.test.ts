import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../tests/helpers/db.helper.js';
import { Tenant, transitionTenantStatus } from './tenant.model.js';

describe('Tenant model', () => {
  useTestDb();

  it('rejects a second tenant with the same document (unique index)', async () => {
    await Tenant.init();
    await Tenant.create({ name: 'Empresa A', document: '12345678000199', status: 'provisioned' });

    await expect(
      Tenant.create({ name: 'Empresa B', document: '12345678000199', status: 'provisioned' }),
    ).rejects.toThrow();
  });

  it('accepts the provisioned -> active transition guarded by the query', async () => {
    const tenant = await Tenant.create({ name: 'Empresa C', document: '11111111000191', status: 'provisioned' });

    const updated = await transitionTenantStatus(tenant._id.toString(), 'provisioned', 'active');

    expect(updated?.status).toBe('active');
  });

  it('returns null for a transition outside the state machine, leaving status unchanged', async () => {
    const tenant = await Tenant.create({ name: 'Empresa D', document: '22222222000192', status: 'provisioned' });

    const result = await transitionTenantStatus(tenant._id.toString(), 'active', 'suspended');

    expect(result).toBeNull();
    const reloaded = await Tenant.findById(tenant._id).lean();
    expect(reloaded?.status).toBe('provisioned');
  });
});
