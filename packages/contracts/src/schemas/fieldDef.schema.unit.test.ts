import { describe, expect, it } from 'vitest';
import { type FieldDef, fieldDefSchema, MAX_FIELDS_PER_TEMPLATE, MAX_TREE_DEPTH } from './fieldDef.schema.js';

const base = { fieldId: 'campo', label: 'Campo' };

describe('fieldDefSchema — os 11 tipos do v1', () => {
  it('accepts a text field with multiline, minLength, maxLength and pattern', () => {
    const result = fieldDefSchema.safeParse({
      ...base,
      type: 'text',
      multiline: true,
      minLength: 1,
      maxLength: 10,
      pattern: '^[a-z]+$',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a number field with min, max, integer and step', () => {
    const result = fieldDefSchema.safeParse({ ...base, type: 'number', min: 0, max: 10, integer: true, step: 2 });
    expect(result.success).toBe(true);
  });

  it('accepts a currency field with code and precision', () => {
    const result = fieldDefSchema.safeParse({ ...base, type: 'currency', code: 'BRL', precision: 2 });
    expect(result.success).toBe(true);
  });

  it('rejects a currency field without code and precision', () => {
    const result = fieldDefSchema.safeParse({ ...base, type: 'currency' });
    expect(result.success).toBe(false);
  });

  it('accepts a percent field with precision', () => {
    const result = fieldDefSchema.safeParse({ ...base, type: 'percent', precision: 1 });
    expect(result.success).toBe(true);
  });

  it('accepts a boolean field with no extra config', () => {
    const result = fieldDefSchema.safeParse({ ...base, type: 'boolean' });
    expect(result.success).toBe(true);
  });

  it('accepts a date field with timezone', () => {
    const result = fieldDefSchema.safeParse({ ...base, type: 'date', timezone: 'America/Sao_Paulo' });
    expect(result.success).toBe(true);
  });

  it('accepts a datetime field with timezone', () => {
    const result = fieldDefSchema.safeParse({ ...base, type: 'datetime', timezone: 'America/Sao_Paulo' });
    expect(result.success).toBe(true);
  });

  it('accepts a select field with key/label options and multiple', () => {
    const result = fieldDefSchema.safeParse({
      ...base,
      type: 'select',
      options: [{ key: 'a', label: 'A' }],
      multiple: true,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a status field with key/label/color/order options', () => {
    const result = fieldDefSchema.safeParse({
      ...base,
      type: 'status',
      options: [{ key: 'novo', label: 'Novo', color: '#3B82F6', order: 0 }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a status option missing color and order', () => {
    const result = fieldDefSchema.safeParse({ ...base, type: 'status', options: [{ key: 'novo', label: 'Novo' }] });
    expect(result.success).toBe(false);
  });

  it('accepts a document field with accept, maxSizeMb and multiple', () => {
    const result = fieldDefSchema.safeParse({
      ...base,
      type: 'document',
      accept: ['application/pdf'],
      maxSizeMb: 5,
      multiple: false,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a reference field for each allowed target', () => {
    for (const target of ['customer', 'product', 'user', 'process']) {
      expect(fieldDefSchema.safeParse({ ...base, type: 'reference', target }).success).toBe(true);
    }
  });

  it('rejects a reference field whose target is outside the allowed set', () => {
    const result = fieldDefSchema.safeParse({ ...base, type: 'reference', target: 'invoice' });
    expect(result.success).toBe(false);
  });

  it('accepts an array field carrying its `of` FieldDef', () => {
    const result = fieldDefSchema.safeParse({
      ...base,
      type: 'array',
      of: { fieldId: 'item', label: 'Item', type: 'text' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts a group field carrying its `fields` FieldDef list', () => {
    const result = fieldDefSchema.safeParse({
      ...base,
      type: 'group',
      fields: [{ fieldId: 'item', label: 'Item', type: 'text' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown field type', () => {
    const result = fieldDefSchema.safeParse({ ...base, type: 'signature' });
    expect(result.success).toBe(false);
  });
});

describe('fieldDefSchema — recursão de array/group', () => {
  it('accepts an array of group of array without losing the inner definition', () => {
    const tree = {
      fieldId: 'linhas',
      label: 'Linhas',
      type: 'array',
      of: {
        fieldId: 'linha',
        label: 'Linha',
        type: 'group',
        fields: [
          {
            fieldId: 'tags',
            label: 'Tags',
            type: 'array',
            of: { fieldId: 'tag', label: 'Tag', type: 'text' },
          },
        ],
      },
    };

    const result = fieldDefSchema.safeParse(tree);
    expect(result.success).toBe(true);
    if (result.success) {
      const parsed = result.data as Extract<FieldDef, { type: 'array' }>;
      const group = parsed.of as Extract<FieldDef, { type: 'group' }>;
      const inner = group.fields[0] as Extract<FieldDef, { type: 'array' }>;
      expect(inner.of.type).toBe('text');
    }
  });
});

describe('fieldDefSchema — limites de FLD-14', () => {
  const nestGroups = (levels: number): unknown => {
    let node: unknown = { fieldId: 'folha', label: 'Folha', type: 'text' };
    for (let level = levels - 1; level > 0; level -= 1) {
      node = { fieldId: `g${level}`, label: `G${level}`, type: 'group', fields: [node] };
    }
    return node;
  };

  it(`accepts a tree exactly at the ${MAX_TREE_DEPTH}-level limit`, () => {
    expect(fieldDefSchema.safeParse(nestGroups(MAX_TREE_DEPTH)).success).toBe(true);
  });

  it(`rejects a tree one level deeper than ${MAX_TREE_DEPTH}`, () => {
    const result = fieldDefSchema.safeParse(nestGroups(MAX_TREE_DEPTH + 1));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes('profundidade'))).toBe(true);
    }
  });

  it(`rejects a tree with more than ${MAX_FIELDS_PER_TEMPLATE} fields`, () => {
    const children = Array.from({ length: MAX_FIELDS_PER_TEMPLATE + 1 }, (_, index) => ({
      fieldId: `campo${index}`,
      label: `Campo ${index}`,
      type: 'text',
    }));
    const result = fieldDefSchema.safeParse({ fieldId: 'raiz', label: 'Raiz', type: 'group', fields: children });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes('campos por template'))).toBe(true);
    }
  });

  it('rejects a fieldId containing a dot', () => {
    expect(fieldDefSchema.safeParse({ fieldId: 'a.b', label: 'A', type: 'text' }).success).toBe(false);
  });

  it('rejects a fieldId containing a dollar sign', () => {
    expect(fieldDefSchema.safeParse({ fieldId: 'a$b', label: 'A', type: 'text' }).success).toBe(false);
  });

  it('rejects a label longer than 120 characters', () => {
    const result = fieldDefSchema.safeParse({ fieldId: 'campo', label: 'x'.repeat(121), type: 'text' });
    expect(result.success).toBe(false);
  });

  it('rejects a forged tenant key smuggled inside a field definition', () => {
    const result = fieldDefSchema.safeParse({ ...base, type: 'text', tenantId: 'forjado' });
    expect(result.success).toBe(false);
  });
});
