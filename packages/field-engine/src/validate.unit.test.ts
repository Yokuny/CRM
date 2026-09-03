import type { FieldDef } from '@crm/contracts';
import { describe, expect, it } from 'vitest';
import { validate } from './validate.js';

const OBJECT_ID = '64b7f2c1a1b2c3d4e5f60718';

describe('validate — uma regra por tipo do v1', () => {
  it('enforces the text length limits', () => {
    const fields: FieldDef[] = [{ fieldId: 'nome', label: 'Nome', type: 'text', maxLength: 3 }];

    expect(Object.keys(validate(fields, { nome: 'Ana Maria' }).errors)).toEqual(['nome']);
    expect(validate(fields, { nome: 'Ana' })).toEqual({ valid: true, errors: {} });
  });

  it('enforces the number min/max limits', () => {
    const fields: FieldDef[] = [{ fieldId: 'idade', label: 'Idade', type: 'number', min: 0, max: 120 }];

    expect(Object.keys(validate(fields, { idade: 130 }).errors)).toEqual(['idade']);
    expect(validate(fields, { idade: 42 }).valid).toBe(true);
  });

  it('requires currency to be an integer in cents', () => {
    const fields: FieldDef[] = [{ fieldId: 'total', label: 'Total', type: 'currency', code: 'BRL', precision: 2 }];

    expect(Object.keys(validate(fields, { total: 10.5 }).errors)).toEqual(['total']);
    expect(validate(fields, { total: 1050 }).valid).toBe(true);
  });

  it('enforces the percent precision', () => {
    const fields: FieldDef[] = [{ fieldId: 'desconto', label: 'Desconto', type: 'percent', precision: 2 }];

    expect(Object.keys(validate(fields, { desconto: 10.125 }).errors)).toEqual(['desconto']);
    expect(validate(fields, { desconto: 10.12 }).valid).toBe(true);
  });

  it('requires boolean to be a real boolean', () => {
    const fields: FieldDef[] = [{ fieldId: 'ativo', label: 'Ativo', type: 'boolean' }];

    expect(Object.keys(validate(fields, { ativo: 'sim' }).errors)).toEqual(['ativo']);
    expect(validate(fields, { ativo: false }).valid).toBe(true);
  });

  it('requires date to be an ISO 8601 date', () => {
    const fields: FieldDef[] = [{ fieldId: 'nascimento', label: 'Nascimento', type: 'date' }];

    expect(Object.keys(validate(fields, { nascimento: '03/09/2026' }).errors)).toEqual(['nascimento']);
    expect(validate(fields, { nascimento: '2026-09-03' }).valid).toBe(true);
  });

  it('requires datetime to carry time, not only a date', () => {
    const fields: FieldDef[] = [{ fieldId: 'quando', label: 'Quando', type: 'datetime' }];

    expect(Object.keys(validate(fields, { quando: '2026-09-03' }).errors)).toEqual(['quando']);
    expect(validate(fields, { quando: '2026-09-03T10:00:00Z' }).valid).toBe(true);
  });

  it('accepts only declared select options', () => {
    const fields: FieldDef[] = [
      {
        fieldId: 'origem',
        label: 'Origem',
        type: 'select',
        options: [
          { key: 'site', label: 'Site' },
          { key: 'indicacao', label: 'Indicação' },
        ],
      },
    ];

    expect(Object.keys(validate(fields, { origem: 'telefone' }).errors)).toEqual(['origem']);
    expect(validate(fields, { origem: 'site' }).valid).toBe(true);
  });

  it('accepts only declared select options inside a multiple select', () => {
    const fields: FieldDef[] = [
      {
        fieldId: 'origem',
        label: 'Origem',
        type: 'select',
        multiple: true,
        options: [{ key: 'site', label: 'Site' }],
      },
    ];

    expect(Object.keys(validate(fields, { origem: ['site', 'telefone'] }).errors)).toEqual(['origem.1']);
    expect(validate(fields, { origem: ['site'] }).valid).toBe(true);
  });

  it('accepts only declared status options', () => {
    const fields: FieldDef[] = [
      {
        fieldId: 'status',
        label: 'Status',
        type: 'status',
        options: [
          { key: 'novo', label: 'Novo', color: '#3B82F6', order: 0 },
          { key: 'ativo', label: 'Ativo', color: '#22C55E', order: 1 },
        ],
      },
    ];

    expect(Object.keys(validate(fields, { status: 'arquivado' }).errors)).toEqual(['status']);
    expect(validate(fields, { status: 'novo' }).valid).toBe(true);
  });

  it('requires a document value to carry assetId, filename, mime and size', () => {
    const fields: FieldDef[] = [{ fieldId: 'anexo', label: 'Anexo', type: 'document' }];
    const complete = { assetId: 'a1', filename: 'contrato.pdf', mime: 'application/pdf', size: 1024 };

    const incomplete = validate(fields, { anexo: { assetId: 'a1' } });
    expect(incomplete.valid).toBe(false);
    expect(Object.keys(incomplete.errors).every((key) => key.startsWith('anexo'))).toBe(true);
    expect(validate(fields, { anexo: complete }).valid).toBe(true);
  });

  it('requires a reference value to be an ObjectId', () => {
    const fields: FieldDef[] = [{ fieldId: 'dono', label: 'Dono', type: 'reference', target: 'user' }];

    expect(Object.keys(validate(fields, { dono: 'usuario-1' }).errors)).toEqual(['dono']);
    expect(validate(fields, { dono: OBJECT_ID }).valid).toBe(true);
  });

  it('applies the inner rule to every item of an array', () => {
    const fields: FieldDef[] = [
      {
        fieldId: 'tags',
        label: 'Tags',
        type: 'array',
        of: { fieldId: 'tag', label: 'Tag', type: 'text', maxLength: 3 },
      },
    ];

    expect(Object.keys(validate(fields, { tags: ['ok', 'muito longa'] }).errors)).toEqual(['tags.1']);
    expect(validate(fields, { tags: ['ok'] }).valid).toBe(true);
  });

  it('applies the inner rule to every field of a group', () => {
    const fields: FieldDef[] = [
      {
        fieldId: 'endereco',
        label: 'Endereço',
        type: 'group',
        fields: [{ fieldId: 'numero', label: 'Número', type: 'number' }],
      },
    ];

    expect(Object.keys(validate(fields, { endereco: { numero: 'dez' } }).errors)).toEqual(['endereco.numero']);
    expect(validate(fields, { endereco: { numero: 10 } }).valid).toBe(true);
  });
});

describe('validate — erros chaveados por fieldId', () => {
  it('keys a nested array-of-group error by its full field path', () => {
    const fields: FieldDef[] = [
      {
        fieldId: 'linhas',
        label: 'Linhas',
        type: 'array',
        of: {
          fieldId: 'linha',
          label: 'Linha',
          type: 'group',
          fields: [{ fieldId: 'produto', label: 'Produto', type: 'text', maxLength: 3 }],
        },
      },
    ];

    const result = validate(fields, { linhas: [{ produto: 'ok' }, { produto: 'nome grande' }] });

    expect(result.valid).toBe(false);
    expect(Object.keys(result.errors)).toEqual(['linhas.1.produto']);
  });

  it('reports one entry per offending fieldId when several fields are invalid', () => {
    const fields: FieldDef[] = [
      { fieldId: 'nome', label: 'Nome', type: 'text', maxLength: 3 },
      { fieldId: 'idade', label: 'Idade', type: 'number', max: 10 },
    ];

    const result = validate(fields, { nome: 'Ana Maria', idade: 99 });

    expect(Object.keys(result.errors).sort()).toEqual(['idade', 'nome']);
    expect(result.errors.nome.length).toBeGreaterThan(0);
  });

  it('flags a missing required field and stays silent for a missing optional one', () => {
    const fields: FieldDef[] = [
      { fieldId: 'nome', label: 'Nome', type: 'text', required: true },
      { fieldId: 'apelido', label: 'Apelido', type: 'text' },
    ];

    expect(Object.keys(validate(fields, {}).errors)).toEqual(['nome']);
    expect(validate(fields, { nome: 'Ana' })).toEqual({ valid: true, errors: {} });
  });
});

describe('validate — nunca lança', () => {
  it('never throws for malformed JS values of the wrong shape', () => {
    const fields: FieldDef[] = [
      { fieldId: 'nome', label: 'Nome', type: 'text' },
      { fieldId: 'tags', label: 'Tags', type: 'array', of: { fieldId: 'tag', label: 'Tag', type: 'text' } },
      {
        fieldId: 'endereco',
        label: 'Endereço',
        type: 'group',
        fields: [{ fieldId: 'rua', label: 'Rua', type: 'text' }],
      },
    ];

    const run = () => validate(fields, { nome: 42, tags: 'nao-e-array', endereco: 7 });

    expect(run).not.toThrow();
    expect(Object.keys(run().errors).sort()).toEqual(['endereco', 'nome', 'tags']);
  });

  it('never throws when the whole values map is not an object', () => {
    const fields: FieldDef[] = [{ fieldId: 'nome', label: 'Nome', type: 'text' }];

    const run = () => validate(fields, 'nao-e-objeto' as unknown as Record<string, unknown>);

    expect(run).not.toThrow();
    expect(run().valid).toBe(false);
  });
});
