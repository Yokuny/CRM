import type { FieldDef } from '@crm/contracts';
import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../tests/helpers/db.helper.js';
import {
  archiveFieldTemplate,
  DEFAULT_CUSTOMER_FIELDS,
  FieldTemplate,
  seedDefaultCustomerTemplate,
} from './fieldTemplate.model.js';
import { FieldTemplateVersion } from './fieldTemplateVersion.model.js';

const baseTemplate = (Tenant: mongoose.Types.ObjectId) => ({
  Tenant,
  targetType: 'customer' as const,
  key: 'default',
  name: 'Cliente',
  currentVersion: 1,
});

describe('FieldTemplate model', () => {
  useTestDb();

  it('rejects a second template with the same {Tenant,targetType,key} (unique index)', async () => {
    await FieldTemplate.init();
    const Tenant = new mongoose.Types.ObjectId();
    await FieldTemplate.create(baseTemplate(Tenant));

    await expect(FieldTemplate.create({ ...baseTemplate(Tenant), name: 'Cliente 2' })).rejects.toMatchObject({
      code: 11000,
    });
  });

  it('accepts the same key for a different targetType in the same Tenant (index covers the triple)', async () => {
    await FieldTemplate.init();
    const Tenant = new mongoose.Types.ObjectId();
    await FieldTemplate.create(baseTemplate(Tenant));

    const other = await FieldTemplate.create({ ...baseTemplate(Tenant), targetType: 'process', name: 'Compra' });

    expect(other.targetType).toBe('process');
    expect(await FieldTemplate.countDocuments({ Tenant })).toBe(2);
  });

  it('accepts the same {targetType,key} for a different Tenant (index is tenant-scoped)', async () => {
    await FieldTemplate.init();
    await FieldTemplate.create(baseTemplate(new mongoose.Types.ObjectId()));

    const other = await FieldTemplate.create(baseTemplate(new mongoose.Types.ObjectId()));

    expect(other.key).toBe('default');
    expect(await FieldTemplate.countDocuments({ targetType: 'customer', key: 'default' })).toBe(2);
  });

  it('creates a template as not archived by default', async () => {
    const template = await FieldTemplate.create(baseTemplate(new mongoose.Types.ObjectId()));

    expect(template.archived).toBe(false);
  });

  it('archives a template guarded by the query, returning the updated document', async () => {
    const template = await FieldTemplate.create(baseTemplate(new mongoose.Types.ObjectId()));

    const archived = await archiveFieldTemplate(template._id.toString());

    expect(archived?.archived).toBe(true);
    const reloaded = await FieldTemplate.findById(template._id).lean();
    expect(reloaded?.archived).toBe(true);
  });

  it('returns null without throwing when archiving an already archived template (idempotent no-op)', async () => {
    const template = await FieldTemplate.create({ ...baseTemplate(new mongoose.Types.ObjectId()), archived: true });

    const result = await archiveFieldTemplate(template._id.toString());

    expect(result).toBeNull();
    const reloaded = await FieldTemplate.findById(template._id).lean();
    expect(reloaded?.archived).toBe(true);
  });

  it('declares the {Tenant,targetType} lookup index', async () => {
    await FieldTemplate.init();

    const indexes = await FieldTemplate.collection.indexes();

    expect(indexes.some((index) => JSON.stringify(index.key) === JSON.stringify({ Tenant: 1, targetType: 1 }))).toBe(
      true,
    );
  });
});

describe('seedDefaultCustomerTemplate', () => {
  useTestDb();

  const statusField = () => DEFAULT_CUSTOMER_FIELDS[0] as Extract<FieldDef, { type: 'status' }>;

  it('seeds a customer template at version 1 carrying the default status field (FLD-09)', async () => {
    const Tenant = new mongoose.Types.ObjectId();

    await seedDefaultCustomerTemplate(Tenant.toString());

    const template = await FieldTemplate.findOne({ Tenant, targetType: 'customer' }).lean();
    expect(template?.key).toBe('default');
    expect(template?.name).toBe('Cliente');
    expect(template?.currentVersion).toBe(1);
    expect(template?.archived).toBe(false);

    const version = await FieldTemplateVersion.findOne({ template: template?._id, version: 1 }).lean();
    expect(version?.targetType).toBe('customer');
    expect(version?.Tenant.toString()).toBe(Tenant.toString());
    expect(version?.fields).toEqual([
      {
        fieldId: 'status',
        label: 'Status',
        type: 'status',
        required: true,
        options: [
          { key: 'novo', label: 'Novo', color: '#3B82F6', order: 0 },
          { key: 'ativo', label: 'Ativo', color: '#22C55E', order: 1 },
          { key: 'inativo', label: 'Inativo', color: '#94A3B8', order: 2 },
        ],
      },
    ]);
  });

  it('gives the seeded status options unique key, label, color and order (kanban-ready)', () => {
    const { options } = statusField();

    expect(new Set(options.map((option) => option.key)).size).toBe(options.length);
    expect(new Set(options.map((option) => option.label)).size).toBe(options.length);
    expect(new Set(options.map((option) => option.color)).size).toBe(options.length);
    expect(new Set(options.map((option) => option.order)).size).toBe(options.length);
  });

  it('creates exactly one template and one version when called twice for the same tenant (FLD-10)', async () => {
    await FieldTemplate.init();
    await FieldTemplateVersion.init();
    const Tenant = new mongoose.Types.ObjectId();

    await seedDefaultCustomerTemplate(Tenant.toString());
    await seedDefaultCustomerTemplate(Tenant.toString());

    expect(await FieldTemplate.countDocuments({ Tenant, targetType: 'customer' })).toBe(1);
    const template = await FieldTemplate.findOne({ Tenant, targetType: 'customer' }).lean();
    expect(await FieldTemplateVersion.countDocuments({ template: template?._id })).toBe(1);
  });

  it('does not revert a customized currentVersion when the seed runs again (FLD-11)', async () => {
    const Tenant = new mongoose.Types.ObjectId();
    await seedDefaultCustomerTemplate(Tenant.toString());
    const template = await FieldTemplate.findOne({ Tenant, targetType: 'customer' }).lean();
    await FieldTemplate.updateOne({ _id: template?._id }, { currentVersion: 2, name: 'Meus Clientes' });

    await seedDefaultCustomerTemplate(Tenant.toString());

    const reloaded = await FieldTemplate.findById(template?._id).lean();
    expect(reloaded?.currentVersion).toBe(2);
    expect(reloaded?.name).toBe('Meus Clientes');
  });

  it('does not overwrite customized fields of version 1 when the seed runs again (FLD-11)', async () => {
    const Tenant = new mongoose.Types.ObjectId();
    await seedDefaultCustomerTemplate(Tenant.toString());
    const template = await FieldTemplate.findOne({ Tenant, targetType: 'customer' }).lean();
    const customFields: FieldDef[] = [{ fieldId: 'apelido', label: 'Apelido', type: 'text' }];
    await FieldTemplateVersion.updateOne({ template: template?._id, version: 1 }, { fields: customFields });

    await seedDefaultCustomerTemplate(Tenant.toString());

    const version = await FieldTemplateVersion.findOne({ template: template?._id, version: 1 }).lean();
    expect(version?.fields).toEqual(customFields);
  });
});
