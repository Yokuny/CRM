import { type FieldDef, TENANT_FORBIDDEN_KEYS } from '@crm/contracts';
import { describe, expect, it } from 'vitest';
import { hydrate } from './hydrate.js';
import { type JsonSchema, toToolSchema } from './toToolSchema.js';
import { validate } from './validate.js';

// Fixture de isomorfismo (FLD-01/AC5): `array` de `group` de `array`.
// A MESMA fixture e as MESMAS expectativas vivem em
// `isomorphism.browser.unit.test.ts`, que roda sob jsdom. Se as duas rodadas
// não produzirem o mesmo resultado, um dos dois arquivos fica vermelho.
const tagDef: FieldDef = { fieldId: 'tag', label: 'Tag', type: 'text' };
const tagsDef: FieldDef = { fieldId: 'tags', label: 'Tags', type: 'array', of: tagDef };
const produtoDef: FieldDef = { fieldId: 'produto', label: 'Produto', type: 'text', required: true, maxLength: 20 };
const linhaDef: FieldDef = { fieldId: 'linha', label: 'Linha', type: 'group', fields: [produtoDef, tagsDef] };
const linhasDef: FieldDef = { fieldId: 'linhas', label: 'Linhas', type: 'array', required: true, of: linhaDef };
const ativoDef: FieldDef = { fieldId: 'ativo', label: 'Ativo', type: 'boolean' };

const ISO_FIELDS: FieldDef[] = [linhasDef, ativoDef];

const ISO_VALUES = {
  linhas: [{ produto: 'Caneta', tags: ['azul'] }, { tags: 'nao-e-array' }],
};

const ISO_HYDRATED = [
  {
    ...linhasDef,
    value: [
      {
        ...linhaDef,
        value: [
          { ...produtoDef, value: 'Caneta' },
          { ...tagsDef, value: [{ ...tagDef, value: 'azul' }] },
        ],
      },
      {
        ...linhaDef,
        value: [
          { ...produtoDef, value: '' },
          { ...tagsDef, value: [] },
        ],
      },
    ],
  },
  { ...ativoDef, value: false },
];

const ISO_TOOL_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['linhas'],
  properties: {
    linhas: {
      type: 'array',
      description: 'Linhas',
      items: {
        type: 'object',
        description: 'Linha',
        additionalProperties: false,
        required: ['produto'],
        properties: {
          produto: { type: 'string', description: 'Produto', maxLength: 20 },
          tags: { type: 'array', description: 'Tags', items: { type: 'string', description: 'Tag' } },
        },
      },
    },
    ativo: { type: 'boolean', description: 'Ativo' },
  },
};

// Árvore com os 11 tipos do v1 (docs/architecture.md).
const allTypes: FieldDef[] = [
  { fieldId: 'nome', label: 'Nome', type: 'text', required: true, minLength: 1, maxLength: 10, pattern: '^[A-Za-z]+$' },
  { fieldId: 'idade', label: 'Idade', type: 'number', integer: true, min: 0, max: 120 },
  { fieldId: 'total', label: 'Total', type: 'currency', code: 'BRL', precision: 2 },
  { fieldId: 'desconto', label: 'Desconto', type: 'percent', precision: 2 },
  { fieldId: 'ativo', label: 'Ativo', type: 'boolean' },
  { fieldId: 'nascimento', label: 'Nascimento', type: 'date' },
  { fieldId: 'quando', label: 'Quando', type: 'datetime' },
  { fieldId: 'origem', label: 'Origem', type: 'select', options: [{ key: 'site', label: 'Site' }] },
  {
    fieldId: 'status',
    label: 'Status',
    type: 'status',
    options: [{ key: 'novo', label: 'Novo', color: '#3B82F6', order: 0 }],
  },
  { fieldId: 'anexo', label: 'Anexo', type: 'document' },
  { fieldId: 'dono', label: 'Dono', type: 'reference', target: 'user' },
  { fieldId: 'tags', label: 'Tags', type: 'array', of: { fieldId: 'tag', label: 'Tag', type: 'text' } },
  {
    fieldId: 'endereco',
    label: 'Endereço',
    type: 'group',
    fields: [{ fieldId: 'rua', label: 'Rua', type: 'text' }],
  },
];

const collectKeys = (value: unknown, found: string[] = []): string[] => {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, found);
    return found;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      found.push(key);
      collectKeys(nested, found);
    }
  }
  return found;
};

describe('toToolSchema', () => {
  it('produces an object schema whose properties are keyed by fieldId', () => {
    const schema = toToolSchema(allTypes);

    expect(schema.type).toBe('object');
    expect(Object.keys(schema.properties ?? {})).toEqual(allTypes.map((field) => field.fieldId));
  });

  it('lists only the required fieldIds under `required`', () => {
    expect(toToolSchema(allTypes).required).toEqual(['nome']);
  });

  it('maps each of the v1 types to its JSON Schema form', () => {
    const properties = toToolSchema(allTypes).properties ?? {};

    expect(properties.nome).toEqual({
      type: 'string',
      description: 'Nome',
      minLength: 1,
      maxLength: 10,
      pattern: '^[A-Za-z]+$',
    });
    expect(properties.idade).toEqual({ type: 'integer', description: 'Idade', minimum: 0, maximum: 120 });
    expect(properties.total.type).toBe('integer');
    expect(properties.desconto.type).toBe('number');
    expect(properties.ativo).toEqual({ type: 'boolean', description: 'Ativo' });
    expect(properties.nascimento).toEqual({ type: 'string', format: 'date', description: 'Nascimento' });
    expect(properties.quando).toEqual({ type: 'string', format: 'date-time', description: 'Quando' });
    expect(properties.anexo.type).toBe('object');
    expect(properties.dono).toEqual({
      type: 'string',
      pattern: '^[0-9a-fA-F]{24}$',
      description: 'Dono (user)',
    });
  });

  it('carries the declared option keys as the enum of select and status', () => {
    const properties = toToolSchema(allTypes).properties ?? {};

    expect(properties.origem.enum).toEqual(['site']);
    expect(properties.status.enum).toEqual(['novo']);
  });

  it('recurses into array via items and into group via properties', () => {
    const properties = toToolSchema(allTypes).properties ?? {};

    expect(properties.tags.items).toEqual({ type: 'string', description: 'Tag' });
    expect(Object.keys(properties.endereco.properties ?? {})).toEqual(['rua']);
  });

  it('emits no tenant key at any level for a tree with the 11 v1 types', () => {
    const keys = collectKeys(toToolSchema(allTypes)).map((key) => key.toLowerCase());

    for (const forbidden of TENANT_FORBIDDEN_KEYS) {
      expect(keys, `o tool schema não pode conter a chave "${forbidden}"`).not.toContain(forbidden);
    }
  });
});

describe('isomorfismo — resultado sob Node (runtime default)', () => {
  it('hydrates the array-of-group-of-array fixture into the expected tree', () => {
    expect(hydrate(ISO_FIELDS, ISO_VALUES)).toEqual(ISO_HYDRATED);
  });

  it('validates the fixture into the expected verdict and error keys', () => {
    const result = validate(ISO_FIELDS, ISO_VALUES);

    expect(result.valid).toBe(false);
    expect(Object.keys(result.errors).sort()).toEqual(['linhas.1.produto', 'linhas.1.tags']);
  });

  it('turns the fixture into the expected tool schema', () => {
    expect(toToolSchema(ISO_FIELDS)).toEqual(ISO_TOOL_SCHEMA);
  });
});
