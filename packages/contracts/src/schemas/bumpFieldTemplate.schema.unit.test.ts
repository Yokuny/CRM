import { describe, expect, it } from 'vitest';
import { bumpFieldTemplateSchema } from './bumpFieldTemplate.schema.js';

const textField = { fieldId: 'observacao', label: 'Observação', type: 'text' };

describe('bumpFieldTemplateSchema', () => {
  it('accepts an additive bump with no migration plan', () => {
    const result = bumpFieldTemplateSchema.safeParse({ expectedVersion: 1, fields: [textField] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.migration).toBeUndefined();
    }
  });

  it('accepts a destructive bump carrying a migration plan per fieldId', () => {
    const result = bumpFieldTemplateSchema.safeParse({
      expectedVersion: 2,
      fields: [textField],
      migration: { status: { action: 'discard' }, antigo: { action: 'mapField', toFieldId: 'observacao' } },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.migration).toEqual({
        status: { action: 'discard' },
        antigo: { action: 'mapField', toFieldId: 'observacao' },
      });
    }
  });

  it('rejects a bump with no expectedVersion', () => {
    expect(bumpFieldTemplateSchema.safeParse({ fields: [textField] }).success).toBe(false);
  });

  it('rejects an expectedVersion below 1', () => {
    expect(bumpFieldTemplateSchema.safeParse({ expectedVersion: 0, fields: [textField] }).success).toBe(false);
  });

  it('rejects a migration plan carrying an unknown action', () => {
    const result = bumpFieldTemplateSchema.safeParse({
      expectedVersion: 1,
      fields: [textField],
      migration: { status: { action: 'rename' } },
    });
    expect(result.success).toBe(false);
  });

  it('rejects every tenant-forging key in the body', () => {
    for (const forged of ['Tenant', 'tenantId', 'orgId']) {
      const result = bumpFieldTemplateSchema.safeParse({
        expectedVersion: 1,
        fields: [textField],
        [forged]: 'forjado',
      });
      expect(result.success, `${forged} deveria ser rejeitado`).toBe(false);
    }
  });
});
