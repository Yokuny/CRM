import type { FieldDef } from '@crm/contracts';
import { FIELD_ID_PATTERN, fieldDefSchema } from '@crm/contracts';
import { diffFields } from '@crm/field-engine';
import { describe, expect, it } from 'vitest';
import {
  emptyField,
  type FieldForm,
  isPlanComplete,
  mapFieldTargets,
  remainingOptions,
  toFieldDefs,
  toFieldForm,
  toFieldId,
  toMigrationPlan,
  toSnakeKey,
} from './template-form.utils.js';

const field = (overrides: Partial<FieldForm>): FieldForm => ({ ...emptyField(), ...overrides });

describe('toFieldId / toSnakeKey', () => {
  it('turns a label into a camelCase fieldId that matches FIELD_ID_PATTERN', () => {
    expect(toFieldId('Última visita')).toBe('ultimaVisita');
    expect(toFieldId('Data de nascimento')).toBe('dataDeNascimento');
    expect(toFieldId('2º contato')).toMatch(FIELD_ID_PATTERN);
  });

  it('turns a label into a snake_case key', () => {
    expect(toSnakeKey('Tratamento estético')).toBe('tratamento_estetico');
    expect(toSnakeKey('Indicação')).toBe('indicacao');
  });
});

describe('toFieldDefs', () => {
  it('generates unique fieldIds for new fields and keeps existing ids untouched', () => {
    const defs = toFieldDefs(
      [
        field({ fieldId: 'origem', label: 'Origem renomeada', type: 'text' }),
        field({ label: 'Origem', type: 'text' }),
        field({ label: 'Origem', type: 'text' }),
      ],
      [{ fieldId: 'origem', label: 'Origem', type: 'text' }],
    );

    expect(defs.map((def) => def.fieldId)).toEqual(['origem', 'origem2', 'origem3']);
    expect(defs[0]?.label).toBe('Origem renomeada');
    for (const def of defs) expect(fieldDefSchema.safeParse(def).success).toBe(true);
  });

  it('keeps config the screen does not show when the type did not change', () => {
    const original: FieldDef = { fieldId: 'cpf', label: 'CPF', type: 'text', pattern: '^\\d{11}$', order: 3 };

    const [def] = toFieldDefs([field({ fieldId: 'cpf', label: 'CPF', type: 'text', required: true })], [original]);

    expect(def).toEqual({ ...original, required: true, multiline: false });
  });

  it('builds select/status options: new options get keys from labels, status gets order by position', () => {
    const [select, status] = toFieldDefs(
      [
        field({
          label: 'Origem',
          type: 'select',
          options: [
            { key: 'google', label: 'Google', color: '' },
            { key: '', label: 'Indicação', color: '' },
            { key: '', label: 'Google', color: '' },
          ],
        }),
        field({
          label: 'Fase',
          type: 'status',
          options: [
            { key: '', label: 'Nova', color: '#111111' },
            { key: '', label: 'Fechada', color: '' },
          ],
        }),
      ],
      [],
    );

    expect(select).toMatchObject({
      type: 'select',
      options: [
        { key: 'google', label: 'Google' },
        { key: 'indicacao', label: 'Indicação' },
        { key: 'google2', label: 'Google' },
      ],
    });
    expect(status).toMatchObject({
      type: 'status',
      options: [
        { key: 'nova', label: 'Nova', color: '#111111', order: 0 },
        { key: 'fechada', label: 'Fechada', color: '#3B82F6', order: 1 },
      ],
    });
  });

  it('preserves a type the screen cannot edit, changing only label/required', () => {
    const original: FieldDef = {
      fieldId: 'endereco',
      label: 'Endereço',
      type: 'group',
      fields: [{ fieldId: 'rua', label: 'Rua', type: 'text' }],
    };

    const [def] = toFieldDefs([{ ...toFieldForm(original), label: 'Endereço completo' }], [original]);

    expect(def).toEqual({ ...original, label: 'Endereço completo', required: false });
  });

  it('round-trips a template through the form without any destructive change', () => {
    const originals: FieldDef[] = [
      {
        fieldId: 'status',
        label: 'Status',
        type: 'status',
        options: [{ key: 'a', label: 'A', color: '#000000', order: 0 }],
      },
      { fieldId: 'valor', label: 'Valor', type: 'currency', code: 'USD', precision: 2 },
    ];

    const defs = toFieldDefs(originals.map(toFieldForm), originals);

    expect(diffFields(originals, defs).kind).toBe('additive');
    expect(defs[1]).toMatchObject({ code: 'USD', precision: 2 });
  });
});

describe('migration plan', () => {
  const originals: FieldDef[] = [
    { fieldId: 'apelido', label: 'Apelido', type: 'text' },
    { fieldId: 'nome2', label: 'Nome social', type: 'text' },
    {
      fieldId: 'origem',
      label: 'Origem',
      type: 'select',
      options: [
        { key: 'google', label: 'Google' },
        { key: 'tv', label: 'TV' },
      ],
    },
  ];
  const next: FieldDef[] = [
    { fieldId: 'nome2', label: 'Nome social', type: 'text' },
    { fieldId: 'origem', label: 'Origem', type: 'select', options: [{ key: 'google', label: 'Google' }] },
  ];
  const diff = diffFields(originals, next);
  const changes = diff.kind === 'destructive' ? diff.changes : [];

  it('offers same-type fields as mapField targets and the remaining options for mapOptions', () => {
    const removed = changes.find((change) => change.fieldId === 'apelido');
    const optionChange = changes.find((change) => change.fieldId === 'origem');
    if (!removed || !optionChange) throw new Error('diff sem as mudanças esperadas');

    expect(mapFieldTargets(removed, originals, next).map((def) => def.fieldId)).toEqual(['nome2']);
    expect(remainingOptions(optionChange, next)).toEqual([{ key: 'google', label: 'Google' }]);
  });

  it('is complete only when every change has a finished action', () => {
    expect(isPlanComplete(changes, {})).toBe(false);
    expect(isPlanComplete(changes, { apelido: { action: 'discard' } })).toBe(false);
    expect(
      isPlanComplete(changes, {
        apelido: { action: 'mapField', toFieldId: '' },
        origem: { action: 'mapOptions', mapping: { tv: 'google' } },
      }),
    ).toBe(false);
    expect(
      isPlanComplete(changes, {
        apelido: { action: 'mapField', toFieldId: 'nome2' },
        origem: { action: 'mapOptions', mapping: { tv: 'google' } },
      }),
    ).toBe(true);
  });

  it('sends only the entries of the current changes', () => {
    expect(
      toMigrationPlan(changes, {
        apelido: { action: 'discard' },
        origem: { action: 'discard' },
        antigo: { action: 'discard' },
      }),
    ).toEqual({ apelido: { action: 'discard' }, origem: { action: 'discard' } });
  });
});
