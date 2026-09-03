// @vitest-environment jsdom
import type { FieldDef } from '@crm/contracts';
import { describe, expect, it } from 'vitest';
import { hydrate } from './hydrate.js';
import { type JsonSchema, toToolSchema } from './toToolSchema.js';
import { validate } from './validate.js';

// FLD-01/AC5 — prova de isomorfismo. Este arquivo roda sob jsdom (pragma
// acima, mesmo mecanismo de apps/web/src/routes/_public/auth/index.unit.test.tsx:1);
// a fixture e as expectativas abaixo são LITERALMENTE as mesmas do bloco
// "isomorfismo — resultado sob Node" de `toToolSchema.unit.test.ts`, que roda
// no runtime default. Divergência entre os dois runtimes deixa um dos dois
// arquivos vermelho.
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

describe('isomorfismo — resultado sob jsdom (browser)', () => {
  // Lido por `globalThis` de propósito: o package NÃO declara a lib DOM no
  // tsconfig (é isomórfico, não pode compilar contra APIs de browser), então
  // referenciar `document`/`window` direto não typechecaria.
  it('really runs under a DOM runtime, not under plain Node', () => {
    const dom = globalThis as { document?: unknown; window?: unknown };

    expect(typeof dom.document).toBe('object');
    expect(typeof dom.window).toBe('object');
  });

  it('hydrates the array-of-group-of-array fixture into the same tree as Node', () => {
    expect(hydrate(ISO_FIELDS, ISO_VALUES)).toEqual(ISO_HYDRATED);
  });

  it('validates the fixture into the same verdict and error keys as Node', () => {
    const result = validate(ISO_FIELDS, ISO_VALUES);

    expect(result.valid).toBe(false);
    expect(Object.keys(result.errors).sort()).toEqual(['linhas.1.produto', 'linhas.1.tags']);
  });

  it('turns the fixture into the same tool schema as Node', () => {
    expect(toToolSchema(ISO_FIELDS)).toEqual(ISO_TOOL_SCHEMA);
  });
});
