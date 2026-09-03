import { describe, expect, it } from 'vitest';
import { migrationActionSchema } from './migrationAction.schema.js';

describe('migrationActionSchema', () => {
  it('accepts the discard action with no extra field', () => {
    expect(migrationActionSchema.safeParse({ action: 'discard' }).success).toBe(true);
  });

  it('accepts the mapField action carrying toFieldId', () => {
    expect(migrationActionSchema.safeParse({ action: 'mapField', toFieldId: 'novoStatus' }).success).toBe(true);
  });

  it('rejects the mapField action without toFieldId', () => {
    expect(migrationActionSchema.safeParse({ action: 'mapField' }).success).toBe(false);
  });

  it('rejects a toFieldId that is not a valid fieldId', () => {
    expect(migrationActionSchema.safeParse({ action: 'mapField', toFieldId: 'a.b' }).success).toBe(false);
  });

  it('accepts the mapOptions action carrying the option mapping', () => {
    const result = migrationActionSchema.safeParse({
      action: 'mapOptions',
      mapping: { inativo: 'arquivado' },
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.action === 'mapOptions') {
      expect(result.data.mapping).toEqual({ inativo: 'arquivado' });
    }
  });

  it('rejects the mapOptions action without a mapping', () => {
    expect(migrationActionSchema.safeParse({ action: 'mapOptions' }).success).toBe(false);
  });

  it('rejects an unknown action', () => {
    expect(migrationActionSchema.safeParse({ action: 'rename', toFieldId: 'outro' }).success).toBe(false);
  });
});
