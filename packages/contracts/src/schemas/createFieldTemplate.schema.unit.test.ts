import { describe, expect, it } from 'vitest';
import { createFieldTemplateSchema } from './createFieldTemplate.schema.js';
import { MAX_FIELDS_PER_TEMPLATE } from './fieldDef.schema.js';

const statusField = {
  fieldId: 'status',
  label: 'Status',
  type: 'status',
  options: [{ key: 'novo', label: 'Novo', color: '#3B82F6', order: 0 }],
};

describe('createFieldTemplateSchema', () => {
  it('accepts a process template carrying its key', () => {
    const result = createFieldTemplateSchema.safeParse({
      targetType: 'process',
      key: 'compra',
      name: 'Compra',
      fields: [statusField],
      stages: ['aguardando_pagamento'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.key).toBe('compra');
    }
  });

  it('rejects a process template with no key', () => {
    const result = createFieldTemplateSchema.safeParse({
      targetType: 'process',
      name: 'Compra',
      fields: [statusField],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'key')).toBe(true);
    }
  });

  it('accepts a customer template with no key', () => {
    const result = createFieldTemplateSchema.safeParse({
      targetType: 'customer',
      name: 'Cliente',
      fields: [statusField],
    });
    expect(result.success).toBe(true);
  });

  it('accepts a customer template with a custom key — forcing the default key is the service rule, not the contract', () => {
    const result = createFieldTemplateSchema.safeParse({
      targetType: 'customer',
      key: 'meu-proprio',
      name: 'Cliente',
      fields: [statusField],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a targetType outside customer/process', () => {
    const result = createFieldTemplateSchema.safeParse({
      targetType: 'order',
      key: 'x',
      name: 'Pedido',
      fields: [statusField],
    });
    expect(result.success).toBe(false);
  });

  it('rejects every tenant-forging key in the body', () => {
    for (const forged of ['Tenant', 'tenantId', 'orgId']) {
      const result = createFieldTemplateSchema.safeParse({
        targetType: 'customer',
        name: 'Cliente',
        fields: [statusField],
        [forged]: 'forjado',
      });
      expect(result.success, `${forged} deveria ser rejeitado`).toBe(false);
    }
  });

  it('rejects an empty fields list', () => {
    const result = createFieldTemplateSchema.safeParse({ targetType: 'customer', name: 'Cliente', fields: [] });
    expect(result.success).toBe(false);
  });

  it(`rejects more than ${MAX_FIELDS_PER_TEMPLATE} top-level fields`, () => {
    const fields = Array.from({ length: MAX_FIELDS_PER_TEMPLATE + 1 }, (_, index) => ({
      fieldId: `campo${index}`,
      label: `Campo ${index}`,
      type: 'text',
    }));
    const result = createFieldTemplateSchema.safeParse({ targetType: 'customer', name: 'Cliente', fields });
    expect(result.success).toBe(false);
  });

  it('rejects a field definition that is invalid on its own', () => {
    const result = createFieldTemplateSchema.safeParse({
      targetType: 'customer',
      name: 'Cliente',
      fields: [{ fieldId: 'a.b', label: 'A', type: 'text' }],
    });
    expect(result.success).toBe(false);
  });

  // AD-023: `stages` é a fonte de verdade da guarda de transição de Process.
  it('accepts a process template carrying valid, unique stages', () => {
    const result = createFieldTemplateSchema.safeParse({
      targetType: 'process',
      key: 'compra',
      name: 'Compra',
      fields: [statusField],
      stages: ['aguardando_pagamento', 'pago', 'concluido'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stages).toEqual(['aguardando_pagamento', 'pago', 'concluido']);
    }
  });

  it('rejects a process template with no stages', () => {
    const result = createFieldTemplateSchema.safeParse({
      targetType: 'process',
      key: 'compra',
      name: 'Compra',
      fields: [statusField],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'stages')).toBe(true);
    }
  });

  it('rejects a process template whose stages contain duplicate values', () => {
    const result = createFieldTemplateSchema.safeParse({
      targetType: 'process',
      key: 'compra',
      name: 'Compra',
      fields: [statusField],
      stages: ['pago', 'pago'],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'stages')).toBe(true);
    }
  });

  it('rejects a customer template that carries stages', () => {
    const result = createFieldTemplateSchema.safeParse({
      targetType: 'customer',
      name: 'Cliente',
      fields: [statusField],
      stages: ['novo'],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'stages')).toBe(true);
    }
  });

  it('accepts a customer template with no stages (unchanged)', () => {
    const result = createFieldTemplateSchema.safeParse({
      targetType: 'customer',
      name: 'Cliente',
      fields: [statusField],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stages).toBeUndefined();
    }
  });
});
