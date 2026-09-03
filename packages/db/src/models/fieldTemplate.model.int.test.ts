import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../tests/helpers/db.helper.js';
import { archiveFieldTemplate, FieldTemplate } from './fieldTemplate.model.js';

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
