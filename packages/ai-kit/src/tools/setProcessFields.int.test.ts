import crypto from 'node:crypto';
import type { FieldDef } from '@crm/contracts';
import { connect, disconnect, FieldTemplate, FieldTemplateVersion, Process } from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setProcessFields } from './setProcessFields.js';
import type { ToolContext } from './toolContext.js';

// Sem `mongoose` aqui (AD-010/boundary) — mesmo padrão de getProcessTemplate.int.test.ts.
// `randomId` também serve para gerar um `customer` ObjectId-shaped válido sem depender de
// um Customer real: a existência de Customer não é preocupação desta tool.
const randomId = (): string => crypto.randomBytes(12).toString('hex');

const baseCtx = (tenantId: string): ToolContext => ({
  tenantId,
  channelId: randomId(),
  conversationId: randomId(),
});

const V1_FIELDS: FieldDef[] = [{ fieldId: 'motivo', label: 'Motivo', type: 'text', required: true }];
const V2_FIELDS: FieldDef[] = [
  { fieldId: 'motivo', label: 'Motivo', type: 'text', required: true },
  { fieldId: 'urgente', label: 'Urgente', type: 'boolean', required: true },
];

const seedTemplate = async (tenant: string, overrides: { currentVersion?: number; fields?: FieldDef[] } = {}) =>
  FieldTemplate.create({
    Tenant: tenant,
    targetType: 'process',
    key: 'orcamento',
    name: 'Orçamento',
    currentVersion: overrides.currentVersion ?? 1,
    archived: false,
  }).then(async (template) => {
    await FieldTemplateVersion.create({
      Tenant: tenant,
      template: template._id,
      targetType: 'process',
      version: 1,
      fields: overrides.fields ?? V1_FIELDS,
      stages: ['novo', 'fechado'],
    });
    return template;
  });

const seedProcess = async (
  tenant: string,
  templateId: string,
  templateVersion: number,
  values: Record<string, unknown>,
) =>
  Process.create({
    Tenant: tenant,
    customer: randomId(),
    template: templateId,
    templateVersion,
    stage: 'novo',
    values,
  });

describe('setProcessFields tool (AIG-19)', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
  });

  afterEach(async () => {
    await Process.deleteMany({});
    await FieldTemplate.deleteMany({});
    await FieldTemplateVersion.deleteMany({});
  });

  afterAll(async () => {
    await disconnect();
  });

  it('persists valid values, fully replacing whatever values existed before', async () => {
    const tenant = randomId();
    const template = await seedTemplate(tenant);
    const process = await seedProcess(tenant, template._id.toString(), 1, { motivo: 'antigo', extra: 'descartado' });

    const result = await setProcessFields(
      { processId: process._id.toString(), values: { motivo: 'novo motivo' } },
      baseCtx(tenant),
    );

    expect(result).toEqual({ ok: true });
    const updated = await Process.findById(process._id).lean();
    expect(updated?.values).toEqual({ motivo: 'novo motivo' });
  });

  it('returns {error, fieldErrors} keyed by the missing required field, and leaves the document unchanged', async () => {
    const tenant = randomId();
    const template = await seedTemplate(tenant);
    const process = await seedProcess(tenant, template._id.toString(), 1, { motivo: 'original' });

    const result = await setProcessFields({ processId: process._id.toString(), values: {} }, baseCtx(tenant));

    expect(result).toEqual({ error: expect.any(String), fieldErrors: { motivo: expect.any(Array) } });
    const unchanged = await Process.findById(process._id).lean();
    expect(unchanged?.values).toEqual({ motivo: 'original' });
  });

  it('returns {error, fieldErrors} keyed by the field with the wrong type, and leaves the document unchanged', async () => {
    const tenant = randomId();
    const template = await seedTemplate(tenant);
    const process = await seedProcess(tenant, template._id.toString(), 1, { motivo: 'original' });

    const result = await setProcessFields(
      { processId: process._id.toString(), values: { motivo: 123 } },
      baseCtx(tenant),
    );

    expect(result).toEqual({ error: expect.any(String), fieldErrors: { motivo: expect.any(Array) } });
    const unchanged = await Process.findById(process._id).lean();
    expect(unchanged?.values).toEqual({ motivo: 'original' });
  });

  it('validates against the templateVersion the Process was created with, even after the template advanced to a newer version', async () => {
    const tenant = randomId();
    const template = await seedTemplate(tenant, { fields: V1_FIELDS });
    const process = await seedProcess(tenant, template._id.toString(), 1, {});
    // Template avança para v2 (campo `urgente` novo e obrigatório) depois do Process já
    // existir com templateVersion:1 — o Process nunca é migrado (AD-023 snapshot).
    await FieldTemplateVersion.create({
      Tenant: tenant,
      template: template._id,
      targetType: 'process',
      version: 2,
      fields: V2_FIELDS,
      stages: ['novo', 'fechado'],
    });
    await FieldTemplate.updateOne({ _id: template._id }, { $set: { currentVersion: 2 } });

    // Válido contra v1 (sem `urgente`); seria inválido contra v2 (currentVersion).
    const result = await setProcessFields(
      { processId: process._id.toString(), values: { motivo: 'consulta' } },
      baseCtx(tenant),
    );

    expect(result).toEqual({ ok: true });
  });

  it('returns {error} and persists nothing when processId belongs to ANOTHER tenant', async () => {
    const tenant = randomId();
    const otherTenant = randomId();
    const template = await seedTemplate(otherTenant);
    const otherProcess = await seedProcess(otherTenant, template._id.toString(), 1, { motivo: 'original' });

    const result = await setProcessFields(
      { processId: otherProcess._id.toString(), values: { motivo: 'invasor' } },
      baseCtx(tenant),
    );

    expect(result).toEqual({ error: expect.any(String) });
    const unchanged = await Process.findById(otherProcess._id).lean();
    expect(unchanged?.values).toEqual({ motivo: 'original' });
  });

  it('returns {error} for a processId that does not exist at all', async () => {
    const tenant = randomId();

    const result = await setProcessFields({ processId: randomId(), values: { motivo: 'x' } }, baseCtx(tenant));

    expect(result).toEqual({ error: expect.any(String) });
    expect(await Process.countDocuments({})).toBe(0);
  });
});
