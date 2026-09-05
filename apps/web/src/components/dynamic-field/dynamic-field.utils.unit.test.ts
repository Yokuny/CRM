import type { FieldDef } from '@crm/contracts';
import { hydrate } from '@crm/field-engine';
import { describe, expect, it } from 'vitest';
import { renderNodesToDefaultValues } from './dynamic-field.utils.js';

// Real `hydrate()` calls throughout (never a hand-rolled RenderNode) — same
// discipline T15's own test harnesses adopted, so a mismatch between this
// util's assumptions and hydrate()'s real output shape fails loudly here
// instead of silently in a route (T22/T24/T26).
describe('renderNodesToDefaultValues (T22 — load-bearing for edit-mode pre-fill)', () => {
  it('round-trips leaf fields, including hydrate()-filled defaults for missing values', () => {
    const fields: FieldDef[] = [
      { fieldId: 'name', label: 'Nome', type: 'text' },
      { fieldId: 'age', label: 'Idade', type: 'number' },
    ];
    const nodes = hydrate(fields, { name: 'Ana' });

    expect(renderNodesToDefaultValues(nodes)).toEqual({ name: 'Ana', age: null });
  });

  it('recursively converts a group node into a plain nested object', () => {
    const fields: FieldDef[] = [
      {
        fieldId: 'address',
        label: 'Endereço',
        type: 'group',
        fields: [
          { fieldId: 'city', label: 'Cidade', type: 'text' },
          { fieldId: 'zip', label: 'CEP', type: 'text' },
        ],
      },
    ];
    const nodes = hydrate(fields, { address: { city: 'São Paulo', zip: '01000-000' } });

    expect(renderNodesToDefaultValues(nodes)).toEqual({ address: { city: 'São Paulo', zip: '01000-000' } });
  });

  it('converts an array of leaf items into a plain array of raw values', () => {
    const fields: FieldDef[] = [
      { fieldId: 'tags', label: 'Tags', type: 'array', of: { fieldId: 'tag', label: 'Tag', type: 'text' } },
    ];
    const nodes = hydrate(fields, { tags: ['a', 'b'] });

    expect(renderNodesToDefaultValues(nodes)).toEqual({ tags: ['a', 'b'] });
  });

  it('converts an array of group items into a plain array of nested objects (array-of-group recursion)', () => {
    const fields: FieldDef[] = [
      {
        fieldId: 'contacts',
        label: 'Contatos',
        type: 'array',
        of: {
          fieldId: 'contact',
          label: 'Contato',
          type: 'group',
          fields: [
            { fieldId: 'name', label: 'Nome', type: 'text' },
            { fieldId: 'phone', label: 'Telefone', type: 'text' },
          ],
        },
      },
    ];
    const nodes = hydrate(fields, {
      contacts: [
        { name: 'Ana', phone: '111' },
        { name: 'Beto', phone: '222' },
      ],
    });

    expect(renderNodesToDefaultValues(nodes)).toEqual({
      contacts: [
        { name: 'Ana', phone: '111' },
        { name: 'Beto', phone: '222' },
      ],
    });
  });

  it('handles a group nested inside a group (deep recursion, not just one level)', () => {
    const fields: FieldDef[] = [
      {
        fieldId: 'outer',
        label: 'Externo',
        type: 'group',
        fields: [
          {
            fieldId: 'inner',
            label: 'Interno',
            type: 'group',
            fields: [{ fieldId: 'leaf', label: 'Folha', type: 'text' }],
          },
        ],
      },
    ];
    const nodes = hydrate(fields, { outer: { inner: { leaf: 'valor' } } });

    expect(renderNodesToDefaultValues(nodes)).toEqual({ outer: { inner: { leaf: 'valor' } } });
  });

  it('returns an empty object for an empty field list (edge case: template with no fields beyond core)', () => {
    expect(renderNodesToDefaultValues(hydrate([], {}))).toEqual({});
  });
});
