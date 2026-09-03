import type { FieldDef } from '@crm/contracts';
import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../tests/helpers/db.helper.js';
import { FieldTemplateVersion } from './fieldTemplateVersion.model.js';

// `array` de `group` de `array` — a mesma forma citada em docs/architecture.md
// como o caso que não pode perder tipo ao atravessar a persistência.
const nestedFields: FieldDef[] = [
  {
    fieldId: 'itens',
    label: 'Itens',
    type: 'array',
    of: {
      fieldId: 'item',
      label: 'Item',
      type: 'group',
      fields: [
        { fieldId: 'produto', label: 'Produto', type: 'text', maxLength: 80 },
        { fieldId: 'preco', label: 'Preço', type: 'currency', code: 'BRL', precision: 2 },
        {
          fieldId: 'lotes',
          label: 'Lotes',
          type: 'array',
          of: { fieldId: 'lote', label: 'Lote', type: 'number', integer: true },
        },
      ],
    },
  },
];

const baseVersion = (template: mongoose.Types.ObjectId) => ({
  Tenant: new mongoose.Types.ObjectId(),
  template,
  targetType: 'process' as const,
  version: 1,
  fields: nestedFields,
});

describe('FieldTemplateVersion model', () => {
  useTestDb();

  it('rejects a second version with the same {template,version} (unique index guards the slot)', async () => {
    await FieldTemplateVersion.init();
    const template = new mongoose.Types.ObjectId();
    await FieldTemplateVersion.create(baseVersion(template));

    await expect(FieldTemplateVersion.create(baseVersion(template))).rejects.toMatchObject({ code: 11000 });
  });

  it('keeps the previous version untouched when a new version of the same template is created', async () => {
    await FieldTemplateVersion.init();
    const template = new mongoose.Types.ObjectId();
    await FieldTemplateVersion.create(baseVersion(template));

    await FieldTemplateVersion.create({
      ...baseVersion(template),
      version: 2,
      fields: [{ fieldId: 'outro', label: 'Outro', type: 'boolean' }],
    });

    const v1 = await FieldTemplateVersion.findOne({ template, version: 1 }).lean();
    expect(v1?.fields).toEqual(nestedFields);
    expect(await FieldTemplateVersion.countDocuments({ template })).toBe(2);
  });

  it('accepts the same version number for a different template (index covers the pair)', async () => {
    await FieldTemplateVersion.init();
    await FieldTemplateVersion.create(baseVersion(new mongoose.Types.ObjectId()));

    const other = await FieldTemplateVersion.create(baseVersion(new mongoose.Types.ObjectId()));

    expect(other.version).toBe(1);
    expect(await FieldTemplateVersion.countDocuments({ version: 1 })).toBe(2);
  });

  it('round-trips an array-of-group-of-array fields tree without losing any type', async () => {
    const created = await FieldTemplateVersion.create(baseVersion(new mongoose.Types.ObjectId()));

    const reloaded = await FieldTemplateVersion.findById(created._id).lean();

    expect(reloaded?.fields).toEqual(nestedFields);
  });

  it('declares the {Tenant,targetType} lookup index', async () => {
    await FieldTemplateVersion.init();

    const indexes = await FieldTemplateVersion.collection.indexes();

    expect(indexes.some((index) => JSON.stringify(index.key) === JSON.stringify({ Tenant: 1, targetType: 1 }))).toBe(
      true,
    );
  });
});
