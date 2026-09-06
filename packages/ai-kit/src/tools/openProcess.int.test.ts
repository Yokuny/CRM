import crypto from 'node:crypto';
import { Customer, connect, disconnect, FieldTemplate, FieldTemplateVersion, Process } from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { openProcess } from './openProcess.js';
import type { ToolContext } from './toolContext.js';

// Sem `mongoose` aqui (AD-010/boundary) — mesmo padrão de getProcessTemplate.int.test.ts.
const randomId = (): string => crypto.randomBytes(12).toString('hex');

const baseCtx = (tenantId: string): ToolContext => ({
  tenantId,
  channelId: randomId(),
  conversationId: randomId(),
});

const seedProcessTemplate = async (
  tenant: string,
  overrides: { key?: string; archived?: boolean; stages?: string[] } = {},
) => {
  const template = await FieldTemplate.create({
    Tenant: tenant,
    targetType: 'process',
    key: overrides.key ?? 'orcamento',
    name: 'Orçamento',
    currentVersion: 1,
    archived: overrides.archived ?? false,
  });
  await FieldTemplateVersion.create({
    Tenant: tenant,
    template: template._id,
    targetType: 'process',
    version: 1,
    fields: [],
    stages: overrides.stages ?? ['novo', 'andamento', 'fechado'],
  });
  return template;
};

const seedCustomer = async (tenant: string) => {
  const customerTemplate = await FieldTemplate.create({
    Tenant: tenant,
    targetType: 'customer',
    key: 'cliente',
    name: 'Cliente',
    currentVersion: 1,
    archived: false,
  });
  return Customer.create({
    Tenant: tenant,
    name: 'Cliente Teste',
    phone: '11900000000',
    template: customerTemplate._id,
    templateVersion: 1,
    values: {},
  });
};

describe('openProcess tool (AIG-17/18)', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
  });

  afterEach(async () => {
    await Process.deleteMany({});
    await Customer.deleteMany({});
    await FieldTemplate.deleteMany({});
    await FieldTemplateVersion.deleteMany({});
  });

  afterAll(async () => {
    await disconnect();
  });

  it('creates a Process with the current templateVersion and stage = stages[0], defaulting values to {} when omitted', async () => {
    const tenant = randomId();
    const template = await seedProcessTemplate(tenant);
    const customer = await seedCustomer(tenant);

    const result = await openProcess(
      { templateKey: 'orcamento', customerId: customer._id.toString() },
      baseCtx(tenant),
    );

    expect(result).toEqual({ processId: expect.any(String), stage: 'novo' });
    const created = await Process.findById((result as { processId: string }).processId).lean();
    expect(created?.template.toString()).toBe(template._id.toString());
    expect(created?.templateVersion).toBe(1);
    expect(created?.customer.toString()).toBe(customer._id.toString());
    expect(created?.values ?? {}).toEqual({});
  });

  it('persists the given values on create', async () => {
    const tenant = randomId();
    await seedProcessTemplate(tenant);
    const customer = await seedCustomer(tenant);

    const result = await openProcess(
      { templateKey: 'orcamento', customerId: customer._id.toString(), values: { motivo: 'consulta' } },
      baseCtx(tenant),
    );

    const created = await Process.findById((result as { processId: string }).processId).lean();
    expect(created?.values).toEqual({ motivo: 'consulta' });
  });

  it('returns {error} and creates nothing when customerId belongs to ANOTHER tenant (forged)', async () => {
    const tenant = randomId();
    const otherTenant = randomId();
    await seedProcessTemplate(tenant);
    const otherCustomer = await seedCustomer(otherTenant);

    const result = await openProcess(
      { templateKey: 'orcamento', customerId: otherCustomer._id.toString() },
      baseCtx(tenant),
    );

    expect(result).toEqual({ error: expect.any(String) });
    expect(await Process.countDocuments({})).toBe(0);
  });

  it('returns {error} and creates nothing for a non-existent templateKey', async () => {
    const tenant = randomId();
    const customer = await seedCustomer(tenant);

    const result = await openProcess(
      { templateKey: 'inexistente', customerId: customer._id.toString() },
      baseCtx(tenant),
    );

    expect(result).toEqual({ error: expect.any(String) });
    expect(await Process.countDocuments({})).toBe(0);
  });

  it('returns {error} and creates nothing for an archived templateKey', async () => {
    const tenant = randomId();
    await seedProcessTemplate(tenant, { archived: true });
    const customer = await seedCustomer(tenant);

    const result = await openProcess(
      { templateKey: 'orcamento', customerId: customer._id.toString() },
      baseCtx(tenant),
    );

    expect(result).toEqual({ error: expect.any(String) });
    expect(await Process.countDocuments({})).toBe(0);
  });
});
