import crypto from 'node:crypto';
import type { FieldDef } from '@crm/contracts';
import { connect, disconnect, FieldTemplate, FieldTemplateVersion } from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getProcessTemplate } from './getProcessTemplate.js';
import type { ToolContext } from './toolContext.js';

// Sem `mongoose` aqui (AD-010/boundary: só packages/db importa mongoose) —
// mesmo padrão de apps/crm-api/src/repositories/customer.repository.int.test.ts.
const randomId = (): string => crypto.randomBytes(12).toString('hex');

const baseCtx = (tenantId: string): ToolContext => ({
  tenantId,
  channelId: randomId(),
  conversationId: randomId(),
});

const SAMPLE_FIELDS: FieldDef[] = [{ fieldId: 'motivo', label: 'Motivo', type: 'text', required: true }];

const seedTemplate = async (
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
    fields: SAMPLE_FIELDS,
    stages: overrides.stages ?? ['novo', 'fechado'],
  });
  return template;
};

describe('getProcessTemplate tool (AIG-15)', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
  });

  afterEach(async () => {
    await FieldTemplate.deleteMany({});
    await FieldTemplateVersion.deleteMany({});
  });

  afterAll(async () => {
    await disconnect();
  });

  it('returns fields (JSON Schema via toToolSchema) + stages from the current FieldTemplateVersion of ctx.tenantId', async () => {
    const tenant = randomId();
    await seedTemplate(tenant, { stages: ['novo', 'andamento', 'fechado'] });

    const result = await getProcessTemplate({ key: 'orcamento' }, baseCtx(tenant));

    expect(result).toEqual({
      fields: {
        type: 'object',
        properties: { motivo: { type: 'string', description: 'Motivo' } },
        additionalProperties: false,
        required: ['motivo'],
      },
      stages: ['novo', 'andamento', 'fechado'],
    });
  });

  it('never returns a template belonging to a different tenant, even with the same key', async () => {
    const tenant = randomId();
    const otherTenant = randomId();
    await seedTemplate(otherTenant, { key: 'orcamento' });

    const result = await getProcessTemplate({ key: 'orcamento' }, baseCtx(tenant));

    expect(result).toEqual({ error: expect.any(String) });
  });

  it('returns {error} for a non-existent key, without throwing', async () => {
    const tenant = randomId();

    const result = await getProcessTemplate({ key: 'inexistente' }, baseCtx(tenant));

    expect(result).toEqual({ error: expect.any(String) });
  });

  it('returns {error} for an archived template, without throwing', async () => {
    const tenant = randomId();
    await seedTemplate(tenant, { archived: true });

    const result = await getProcessTemplate({ key: 'orcamento' }, baseCtx(tenant));

    expect(result).toEqual({ error: expect.any(String) });
  });

  it('ignores a forged tenant field smuggled into input — only ctx.tenantId ever selects the template', async () => {
    const tenant = randomId();
    const otherTenant = randomId();
    await seedTemplate(tenant, { key: 'orcamento' });
    await seedTemplate(otherTenant, { key: 'outro-orcamento' });
    const forgedInput = { key: 'orcamento', tenantId: otherTenant, Tenant: otherTenant } as unknown as {
      key: string;
    };

    const result = await getProcessTemplate(forgedInput, baseCtx(tenant));

    expect(result).toEqual({
      fields: expect.any(Object),
      stages: ['novo', 'fechado'],
    });
  });
});
