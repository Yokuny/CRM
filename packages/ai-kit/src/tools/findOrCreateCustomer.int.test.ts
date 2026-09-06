import crypto from 'node:crypto';
import { Customer, connect, disconnect, FieldTemplate } from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { findOrCreateCustomer } from './findOrCreateCustomer.js';
import type { ToolContext } from './toolContext.js';

// Sem `mongoose` aqui (AD-010/boundary) — mesmo padrão de getProcessTemplate.int.test.ts.
const randomId = (): string => crypto.randomBytes(12).toString('hex');

const baseCtx = (tenantId: string): ToolContext => ({
  tenantId,
  channelId: randomId(),
  conversationId: randomId(),
});

const seedCustomerTemplate = async (tenant: string) =>
  FieldTemplate.create({
    Tenant: tenant,
    targetType: 'customer',
    key: 'cliente',
    name: 'Cliente',
    currentVersion: 1,
    archived: false,
  });

describe('findOrCreateCustomer tool (AIG-16)', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
  });

  afterEach(async () => {
    await Customer.deleteMany({});
    await FieldTemplate.deleteMany({});
  });

  afterAll(async () => {
    await disconnect();
  });

  it('reuses the most recently updated Customer when the phone has 2+ Customer in the same tenant, never creating a duplicate', async () => {
    const tenant = randomId();
    await seedCustomerTemplate(tenant);
    const template = await FieldTemplate.findOne({ Tenant: tenant, targetType: 'customer' }).lean();
    const older = await Customer.create({
      Tenant: tenant,
      name: 'Mais Antigo',
      phone: '11900000000',
      template: template?._id,
      templateVersion: 1,
      values: {},
    });
    const mostRecent = await Customer.create({
      Tenant: tenant,
      name: 'Mais Recente',
      phone: '11900000000',
      template: template?._id,
      templateVersion: 1,
      values: {},
    });
    // Garante determinismo do updatedAt desc, independente da resolução de
    // timestamp/ordem real de criação no ambiente de teste: seta os dois
    // updatedAt explicitamente, com `timestamps:false` para o Mongoose não
    // sobrescrever o valor com "agora" no próprio update.
    const now = Date.now();
    await Customer.updateOne(
      { _id: older._id },
      { $set: { updatedAt: new Date(now - 60_000) } },
      { timestamps: false },
    );
    await Customer.updateOne({ _id: mostRecent._id }, { $set: { updatedAt: new Date(now) } }, { timestamps: false });

    const result = await findOrCreateCustomer({ phone: '11900000000' }, baseCtx(tenant));

    expect(result).toEqual({ customerId: mostRecent._id.toString(), created: false });
    expect(await Customer.countDocuments({ Tenant: tenant, phone: '11900000000' })).toBe(2);
  });

  it('creates a new Customer against the current customer FieldTemplate when the phone has no Customer in the tenant', async () => {
    const tenant = randomId();
    await seedCustomerTemplate(tenant);
    const template = await FieldTemplate.findOne({ Tenant: tenant, targetType: 'customer' }).lean();

    const result = await findOrCreateCustomer({ name: 'Novo Cliente', phone: '11911112222' }, baseCtx(tenant));

    expect(result.created).toBe(true);
    const created = await Customer.findById(result.customerId).lean();
    expect(created?.template.toString()).toBe(template?._id.toString());
    expect(created?.templateVersion).toBe(1);
    // Mongoose `minimize:true` (default, customer.model.ts has no override) strips an
    // empty Mixed `values` object before writing — `.lean()` reads back `undefined`, not
    // `{}`. Same documented quirk/workaround as `process.repository.ts`'s `toRecord`
    // (`doc.values ?? {}`) — the assertion below normalizes the same way.
    expect(created?.values ?? {}).toEqual({});
  });

  it('never reuses a phone that only exists in ANOTHER tenant — creates a new Customer in ctx tenant instead', async () => {
    const tenant = randomId();
    const otherTenant = randomId();
    await seedCustomerTemplate(tenant);
    await seedCustomerTemplate(otherTenant);
    const otherTemplate = await FieldTemplate.findOne({ Tenant: otherTenant, targetType: 'customer' }).lean();
    const otherCustomer = await Customer.create({
      Tenant: otherTenant,
      name: 'Cliente de Outro Tenant',
      phone: '11933334444',
      template: otherTemplate?._id,
      templateVersion: 1,
      values: {},
    });

    const result = await findOrCreateCustomer({ phone: '11933334444' }, baseCtx(tenant));

    expect(result.created).toBe(true);
    expect(result.customerId).not.toBe(otherCustomer._id.toString());
    expect(await Customer.countDocuments({ Tenant: tenant, phone: '11933334444' })).toBe(1);
    expect(await Customer.countDocuments({ Tenant: otherTenant, phone: '11933334444' })).toBe(1);
  });

  it('a second call with the same phone after creation reuses the just-created Customer, never creating a second one', async () => {
    const tenant = randomId();
    await seedCustomerTemplate(tenant);

    const first = await findOrCreateCustomer({ name: 'Cliente Único', phone: '11955556666' }, baseCtx(tenant));
    const second = await findOrCreateCustomer({ phone: '11955556666' }, baseCtx(tenant));

    expect(first.created).toBe(true);
    expect(second).toEqual({ customerId: first.customerId, created: false });
    expect(await Customer.countDocuments({ Tenant: tenant, phone: '11955556666' })).toBe(1);
  });

  // design.md's documented input signature (`{name?; phone; document?}`) makes both
  // fields optional independently of each other — WhatsApp only guarantees `phone`.
  it('creates a Customer using phone as the name fallback when name is omitted, and persists document when provided', async () => {
    const tenant = randomId();
    await seedCustomerTemplate(tenant);

    const result = await findOrCreateCustomer({ phone: '11977778888', document: '12345678900' }, baseCtx(tenant));

    const created = await Customer.findById(result.customerId).lean();
    expect(created?.name).toBe('11977778888');
    expect(created?.document).toBe('12345678900');
  });
});
