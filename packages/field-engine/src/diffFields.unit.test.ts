import type { FieldDef } from '@crm/contracts';
import { describe, expect, it } from 'vitest';
import { diffFields } from './diffFields.js';

const statusDef: FieldDef = {
  fieldId: 'status',
  label: 'Status',
  type: 'status',
  options: [
    { key: 'novo', label: 'Novo', color: '#3B82F6', order: 0 },
    { key: 'ativo', label: 'Ativo', color: '#22C55E', order: 1 },
  ],
};

const nomeDef: FieldDef = { fieldId: 'nome', label: 'Nome', type: 'text' };

describe('diffFields — mudanças aditivas', () => {
  it('classifies an unchanged tree as additive with no changes', () => {
    expect(diffFields([statusDef, nomeDef], [statusDef, nomeDef])).toEqual({ kind: 'additive', changes: [] });
  });

  it('classifies a brand new optional field as additive', () => {
    const added: FieldDef = { fieldId: 'apelido', label: 'Apelido', type: 'text' };

    expect(diffFields([nomeDef], [nomeDef, added])).toEqual({ kind: 'additive', changes: [] });
  });

  it('classifies a label change as additive', () => {
    const renamed: FieldDef = { ...nomeDef, label: 'Nome completo' };

    expect(diffFields([nomeDef], [renamed])).toEqual({ kind: 'additive', changes: [] });
  });

  it('classifies an order change as additive', () => {
    const reordered: FieldDef = { ...nomeDef, order: 7 };

    expect(diffFields([nomeDef], [reordered])).toEqual({ kind: 'additive', changes: [] });
  });

  it('classifies a brand new option as additive', () => {
    const withExtraOption: FieldDef = {
      ...statusDef,
      type: 'status',
      options: [...statusDef.options, { key: 'inativo', label: 'Inativo', color: '#94A3B8', order: 2 }],
    };

    expect(diffFields([statusDef], [withExtraOption])).toEqual({ kind: 'additive', changes: [] });
  });
});

describe('diffFields — mudanças destrutivas', () => {
  it('classifies a removed field as destructive, naming the fieldId', () => {
    const diff = diffFields([statusDef, nomeDef], [nomeDef]);

    expect(diff.kind).toBe('destructive');
    expect(diff.changes).toEqual([{ fieldId: 'status', reason: 'fieldRemoved' }]);
  });

  it('classifies a changed type as destructive, naming the fieldId and both types', () => {
    const retyped: FieldDef = { fieldId: 'nome', label: 'Nome', type: 'number' };

    const diff = diffFields([nomeDef], [retyped]);

    expect(diff.kind).toBe('destructive');
    expect(diff.changes).toEqual([{ fieldId: 'nome', reason: 'typeChanged', from: 'text', to: 'number' }]);
  });

  it('classifies a removed option as destructive, naming the fieldId and the option', () => {
    const withoutAtivo: FieldDef = {
      ...statusDef,
      type: 'status',
      options: [{ key: 'novo', label: 'Novo', color: '#3B82F6', order: 0 }],
    };

    const diff = diffFields([statusDef], [withoutAtivo]);

    expect(diff.kind).toBe('destructive');
    expect(diff.changes).toEqual([{ fieldId: 'status', reason: 'optionRemoved', removedOptions: ['ativo'] }]);
  });

  it('classifies a field removed inside a group by its full path', () => {
    const before: FieldDef = {
      fieldId: 'endereco',
      label: 'Endereço',
      type: 'group',
      fields: [nomeDef, { fieldId: 'rua', label: 'Rua', type: 'text' }],
    };
    const after: FieldDef = { ...before, type: 'group', fields: [nomeDef] };

    const diff = diffFields([before], [after]);

    expect(diff.kind).toBe('destructive');
    expect(diff.changes).toEqual([{ fieldId: 'endereco.rua', reason: 'fieldRemoved' }]);
  });

  it('classifies a changed item type inside an array by its full path', () => {
    const before: FieldDef = {
      fieldId: 'tags',
      label: 'Tags',
      type: 'array',
      of: { fieldId: 'tag', label: 'Tag', type: 'text' },
    };
    const after: FieldDef = {
      fieldId: 'tags',
      label: 'Tags',
      type: 'array',
      of: { fieldId: 'tag', label: 'Tag', type: 'number' },
    };

    const diff = diffFields([before], [after]);

    expect(diff.kind).toBe('destructive');
    expect(diff.changes).toEqual([{ fieldId: 'tags.tag', reason: 'typeChanged', from: 'text', to: 'number' }]);
  });

  it('reports every destructive change at once, not just the first', () => {
    const retyped: FieldDef = { fieldId: 'nome', label: 'Nome', type: 'number' };

    const diff = diffFields([statusDef, nomeDef], [retyped]);

    expect(diff.kind).toBe('destructive');
    expect(diff.changes).toEqual([
      { fieldId: 'status', reason: 'fieldRemoved' },
      { fieldId: 'nome', reason: 'typeChanged', from: 'text', to: 'number' },
    ]);
  });
});
