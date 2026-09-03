import type { FieldDef } from '@crm/contracts';
import { describe, expect, it } from 'vitest';
import { emptyValueFor } from './emptyValue.js';

const base = { fieldId: 'campo', label: 'Campo' };

describe('emptyValueFor', () => {
  it('returns an empty string for text', () => {
    expect(emptyValueFor({ ...base, type: 'text' })).toBe('');
  });

  it('returns null for number, percent and currency', () => {
    expect(emptyValueFor({ ...base, type: 'number' })).toBeNull();
    expect(emptyValueFor({ ...base, type: 'percent', precision: 2 })).toBeNull();
    expect(emptyValueFor({ ...base, type: 'currency', code: 'BRL', precision: 2 })).toBeNull();
  });

  it('returns false for boolean', () => {
    expect(emptyValueFor({ ...base, type: 'boolean' })).toBe(false);
  });

  it('returns null for date and datetime', () => {
    expect(emptyValueFor({ ...base, type: 'date' })).toBeNull();
    expect(emptyValueFor({ ...base, type: 'datetime' })).toBeNull();
  });

  it('returns an empty array for a multiple select and a multiple reference', () => {
    expect(emptyValueFor({ ...base, type: 'select', options: [], multiple: true })).toEqual([]);
    expect(emptyValueFor({ ...base, type: 'reference', target: 'customer', multiple: true })).toEqual([]);
  });

  it('returns null for a single select and a single reference', () => {
    expect(emptyValueFor({ ...base, type: 'select', options: [] })).toBeNull();
    expect(emptyValueFor({ ...base, type: 'reference', target: 'customer' })).toBeNull();
  });

  it('returns null for status', () => {
    expect(emptyValueFor({ ...base, type: 'status', options: [] })).toBeNull();
  });

  it('returns null for document', () => {
    expect(emptyValueFor({ ...base, type: 'document' })).toBeNull();
  });

  it('never returns undefined for any of the v1 field types', () => {
    const fields: FieldDef[] = [
      { ...base, type: 'text' },
      { ...base, type: 'number' },
      { ...base, type: 'currency', code: 'BRL', precision: 2 },
      { ...base, type: 'percent', precision: 2 },
      { ...base, type: 'boolean' },
      { ...base, type: 'date' },
      { ...base, type: 'datetime' },
      { ...base, type: 'select', options: [] },
      { ...base, type: 'status', options: [] },
      { ...base, type: 'document' },
      { ...base, type: 'reference', target: 'customer' },
      { ...base, type: 'array', of: { ...base, type: 'text' } },
      { ...base, type: 'group', fields: [] },
    ];

    for (const field of fields) {
      expect(emptyValueFor(field), `${field.type} não pode devolver undefined`).not.toBeUndefined();
    }
  });
});
