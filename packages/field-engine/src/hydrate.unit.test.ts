import type { FieldDef } from '@crm/contracts';
import { describe, expect, it } from 'vitest';
import { hydrate, type RenderNode } from './hydrate.js';

// Fixture citada em docs/architecture.md: `array` de `group` de `array`.
const linhasField: FieldDef = {
  fieldId: 'linhas',
  label: 'Linhas',
  type: 'array',
  of: {
    fieldId: 'linha',
    label: 'Linha',
    type: 'group',
    fields: [
      { fieldId: 'produto', label: 'Produto', type: 'text' },
      {
        fieldId: 'tags',
        label: 'Tags',
        type: 'array',
        of: { fieldId: 'tag', label: 'Tag', type: 'text' },
      },
    ],
  },
};

const nodesOf = (node: RenderNode): RenderNode[] => node.value as RenderNode[];

describe('hydrate', () => {
  it('returns one node per field, in the declared order', () => {
    const fields: FieldDef[] = [
      { fieldId: 'nome', label: 'Nome', type: 'text' },
      { fieldId: 'ativo', label: 'Ativo', type: 'boolean' },
    ];

    const nodes = hydrate(fields, { nome: 'Ana', ativo: true });

    expect(nodes.map((node) => node.fieldId)).toEqual(['nome', 'ativo']);
  });

  it('keeps every key of the original FieldDef and adds only `value`', () => {
    const field: FieldDef = {
      fieldId: 'nome',
      label: 'Nome',
      type: 'text',
      required: true,
      order: 3,
      maxLength: 10,
    };

    const [node] = hydrate([field], { nome: 'Ana' });

    expect(node).toEqual({ ...field, value: 'Ana' });
  });

  it('fills a missing value with the empty representation of the type', () => {
    const fields: FieldDef[] = [
      { fieldId: 'nome', label: 'Nome', type: 'text' },
      { fieldId: 'total', label: 'Total', type: 'number' },
      { fieldId: 'ativo', label: 'Ativo', type: 'boolean' },
      { fieldId: 'tags', label: 'Tags', type: 'select', options: [], multiple: true },
    ];

    const nodes = hydrate(fields, {});

    expect(nodes.map((node) => node.value)).toEqual(['', null, false, []]);
  });

  it('never leaves a node value as undefined', () => {
    const fields: FieldDef[] = [
      { fieldId: 'nome', label: 'Nome', type: 'text' },
      { fieldId: 'quando', label: 'Quando', type: 'datetime' },
      { fieldId: 'anexo', label: 'Anexo', type: 'document' },
      { fieldId: 'dono', label: 'Dono', type: 'reference', target: 'user' },
      { fieldId: 'grupo', label: 'Grupo', type: 'group', fields: [] },
      linhasField,
    ];

    for (const node of hydrate(fields, {})) {
      expect(node.value, `${node.fieldId} não pode ficar undefined`).not.toBeUndefined();
    }
  });

  it('preserves a stored false instead of treating it as absent', () => {
    const [node] = hydrate([{ fieldId: 'ativo', label: 'Ativo', type: 'boolean' }], { ativo: false });

    expect(node.value).toBe(false);
  });

  it('resolves a group to the hydrated nodes of its own fields', () => {
    const group: FieldDef = {
      fieldId: 'endereco',
      label: 'Endereço',
      type: 'group',
      fields: [
        { fieldId: 'rua', label: 'Rua', type: 'text' },
        { fieldId: 'numero', label: 'Número', type: 'number' },
      ],
    };

    const [node] = hydrate([group], { endereco: { rua: 'Av. Paulista' } });
    const children = nodesOf(node);

    expect(children.map((child) => child.fieldId)).toEqual(['rua', 'numero']);
    expect(children.map((child) => child.value)).toEqual(['Av. Paulista', null]);
  });

  it('resolves a group with no stored object to its children filled with empties', () => {
    const group: FieldDef = {
      fieldId: 'endereco',
      label: 'Endereço',
      type: 'group',
      fields: [{ fieldId: 'rua', label: 'Rua', type: 'text' }],
    };

    const [node] = hydrate([group], {});

    expect(nodesOf(node).map((child) => child.value)).toEqual(['']);
  });

  it('resolves an array to one hydrated node per stored item', () => {
    const array: FieldDef = {
      fieldId: 'tags',
      label: 'Tags',
      type: 'array',
      of: { fieldId: 'tag', label: 'Tag', type: 'text' },
    };

    const [node] = hydrate([array], { tags: ['urgente', 'novo'] });

    expect(nodesOf(node).map((child) => child.value)).toEqual(['urgente', 'novo']);
  });

  it('resolves an array whose stored value is not an array to an empty node list', () => {
    const array: FieldDef = {
      fieldId: 'tags',
      label: 'Tags',
      type: 'array',
      of: { fieldId: 'tag', label: 'Tag', type: 'text' },
    };

    const [node] = hydrate([array], { tags: 'urgente' });

    expect(node.value).toEqual([]);
  });

  it('hydrates an array of group of array without losing the innermost type', () => {
    const [node] = hydrate([linhasField], {
      linhas: [{ produto: 'Caneta', tags: ['azul', 'fina'] }],
    });

    const rows = nodesOf(node);
    expect(rows).toHaveLength(1);

    const rowChildren = nodesOf(rows[0]);
    expect(rowChildren.map((child) => child.fieldId)).toEqual(['produto', 'tags']);
    expect(rowChildren[0].value).toBe('Caneta');

    const tagNodes = nodesOf(rowChildren[1]);
    expect(tagNodes.map((tag) => tag.type)).toEqual(['text', 'text']);
    expect(tagNodes.map((tag) => tag.value)).toEqual(['azul', 'fina']);
  });

  it('returns a dangling reference value as stored instead of throwing', () => {
    const field: FieldDef = { fieldId: 'dono', label: 'Dono', type: 'reference', target: 'user' };

    const run = () => hydrate([field], { dono: '64b7f2c1a1b2c3d4e5f60718' });

    expect(run).not.toThrow();
    expect(run()[0].value).toBe('64b7f2c1a1b2c3d4e5f60718');
  });
});
