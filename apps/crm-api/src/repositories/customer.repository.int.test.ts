import crypto from 'node:crypto';
import { NO_STATUS_FILTER_VALUE } from '@crm/contracts';
import { Customer, connect, disconnect } from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import * as customerRepository from './customer.repository.js';

// Sem `mongoose` aqui (AD-010/boundary estrutural: só packages/db importa
// mongoose) — mesmo padrão de customer.fieldValueStore.int.test.ts.
const randomId = (): string => crypto.randomBytes(12).toString('hex');

const baseCustomer = (tenant: string, overrides: Partial<Record<string, unknown>> = {}) => ({
  Tenant: tenant,
  name: 'Cliente',
  phone: '11900000000',
  template: randomId(),
  templateVersion: 1,
  values: {},
  ...overrides,
});

const baseQuery = (overrides: Partial<Parameters<typeof customerRepository.listCustomers>[1]> = {}) => ({
  page: 1,
  limit: 20,
  sort: 'createdAt' as const,
  order: 'desc' as const,
  ...overrides,
});

describe('customer.repository.listCustomers — status=__none__ sentinel (WEB-02)', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
  });

  afterEach(async () => {
    await Customer.deleteMany({});
  });

  afterAll(async () => {
    await disconnect();
  });

  it('matches a Customer with no values.status key at all', async () => {
    const tenant = randomId();
    await Customer.create(baseCustomer(tenant, { name: 'Sem Status', values: {} }));

    const result = await customerRepository.listCustomers(
      tenant,
      baseQuery({ status: NO_STATUS_FILTER_VALUE, knownStatusKeys: ['novo', 'ativo'] }),
    );

    expect(result.total).toBe(1);
    expect(result.items[0]?.name).toBe('Sem Status');
  });

  it('matches a Customer whose values.status holds a key no longer among the current template options', async () => {
    const tenant = randomId();
    await Customer.create(baseCustomer(tenant, { name: 'Status Obsoleto', values: { status: 'arquivado_antigo' } }));

    const result = await customerRepository.listCustomers(
      tenant,
      baseQuery({ status: NO_STATUS_FILTER_VALUE, knownStatusKeys: ['novo', 'ativo'] }),
    );

    expect(result.total).toBe(1);
    expect(result.items[0]?.name).toBe('Status Obsoleto');
  });

  it('excludes a Customer whose values.status is still a valid current option', async () => {
    const tenant = randomId();
    await Customer.create(baseCustomer(tenant, { name: 'Status Válido', values: { status: 'novo' } }));

    const result = await customerRepository.listCustomers(
      tenant,
      baseQuery({ status: NO_STATUS_FILTER_VALUE, knownStatusKeys: ['novo', 'ativo'] }),
    );

    expect(result.total).toBe(0);
    expect(result.items).toEqual([]);
  });

  it('combines both "no status" cases in the same __none__ query, tenant-scoped', async () => {
    const tenant = randomId();
    const otherTenant = randomId();
    await Customer.create(baseCustomer(tenant, { name: 'Sem Status', values: {} }));
    await Customer.create(baseCustomer(tenant, { name: 'Status Obsoleto', values: { status: 'arquivado_antigo' } }));
    await Customer.create(baseCustomer(tenant, { name: 'Status Válido', values: { status: 'novo' } }));
    await Customer.create(baseCustomer(otherTenant, { name: 'Outro Tenant Sem Status', values: {} }));

    const result = await customerRepository.listCustomers(
      tenant,
      baseQuery({ status: NO_STATUS_FILTER_VALUE, knownStatusKeys: ['novo', 'ativo'] }),
    );

    expect(result.total).toBe(2);
    expect(result.items.map((item) => item.name).sort()).toEqual(['Sem Status', 'Status Obsoleto']);
  });
});
