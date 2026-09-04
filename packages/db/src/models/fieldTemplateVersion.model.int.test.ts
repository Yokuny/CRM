import type { FieldDef } from '@crm/contracts';
import { hydrate } from '@crm/field-engine';
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

  // FLD-06/AC4: um registro antigo aponta pra uma templateVersion anterior e
  // `hydrate` precisa renderizá-la fiel MESMO DEPOIS do template ter avançado
  // várias versões — a conjunção exata que o AC pede, não só "a versão antiga
  // não foi sobrescrita" (já provado acima). Sem rota HTTP: nenhuma desta
  // feature serve uma versão arbitrária (design.md só expõe a corrente), e o
  // spec fala do MOTOR (`hydrate`) renderizando o registro antigo, não de uma
  // API — provar direto no model, sem inventar endpoint fora do design.
  it('hydrates fields exactly as v1 defined them after the template has advanced to v3 (FLD-06/AC4)', async () => {
    const template = new mongoose.Types.ObjectId();
    const v1Fields: FieldDef[] = [
      {
        fieldId: 'status',
        label: 'Status',
        type: 'status',
        options: [{ key: 'novo', label: 'Novo', color: '#3B82F6', order: 0 }],
      },
    ];
    await FieldTemplateVersion.create({ ...baseVersion(template), version: 1, fields: v1Fields });
    await FieldTemplateVersion.create({
      ...baseVersion(template),
      version: 2,
      fields: [...v1Fields, { fieldId: 'obs', label: 'Observação', type: 'text', maxLength: 200 }],
    });
    await FieldTemplateVersion.create({
      ...baseVersion(template),
      version: 3,
      fields: [
        {
          fieldId: 'status',
          label: 'Situação',
          type: 'status',
          options: [{ key: 'ativo', label: 'Ativo', color: '#22C55E', order: 0 }],
        },
      ],
    });

    // Um registro fictício aponta para a v1 (nunca migrou) — o template já
    // está em v3, com o MESMO fieldId 'status' redefinido (label e opções
    // diferentes). Se `hydrate` usasse a definição corrente por engano, o
    // label seria 'Situação' e a opção seria 'ativo', não 'novo'.
    const oldVersion = await FieldTemplateVersion.findOne({ template, version: 1 }).lean();
    const rendered = hydrate(oldVersion?.fields as FieldDef[], { status: 'novo' });

    expect(rendered).toEqual([{ ...v1Fields[0], value: 'novo' }]);
  });

  it('declares the {Tenant,targetType} lookup index', async () => {
    await FieldTemplateVersion.init();

    const indexes = await FieldTemplateVersion.collection.indexes();

    expect(indexes.some((index) => JSON.stringify(index.key) === JSON.stringify({ Tenant: 1, targetType: 1 }))).toBe(
      true,
    );
  });
});
