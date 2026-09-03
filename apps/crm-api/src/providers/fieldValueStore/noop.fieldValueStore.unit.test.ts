import type { MigrationPlan } from '@crm/contracts';
import { describe, expect, it } from 'vitest';
import { createNoopFieldValueStore } from './noop.fieldValueStore.js';

const TENANT = '65b0f3e2a1c4d5e6f7081920';
const TEMPLATE = '65b0f3e2a1c4d5e6f7081921';

describe('createNoopFieldValueStore', () => {
  it('always resolves 0 records for any tenant, template and version', async () => {
    const store = createNoopFieldValueStore();

    expect(await store.countByTemplateVersion(TENANT, TEMPLATE, 1)).toBe(0);
    expect(await store.countByTemplateVersion('65b0f3e2a1c4d5e6f7081999', TEMPLATE, 7)).toBe(0);
  });

  it('always resolves {migrated: 0} for a discard plan', async () => {
    const store = createNoopFieldValueStore();
    const migration: MigrationPlan = { status: { action: 'discard' } };

    expect(await store.migrateValues(TENANT, TEMPLATE, 1, 2, migration)).toEqual({ migrated: 0 });
  });

  it('ignores the plan entirely: mapField and mapOptions also resolve {migrated: 0}', async () => {
    const store = createNoopFieldValueStore();
    const mapField: MigrationPlan = { status: { action: 'mapField', toFieldId: 'situacao' } };
    const mapOptions: MigrationPlan = { status: { action: 'mapOptions', mapping: { inativo: 'ativo' } } };

    expect(await store.migrateValues(TENANT, TEMPLATE, 1, 2, mapField)).toEqual({ migrated: 0 });
    expect(await store.migrateValues(TENANT, TEMPLATE, 1, 2, mapOptions)).toEqual({ migrated: 0 });
    expect(await store.migrateValues(TENANT, TEMPLATE, 1, 2, {})).toEqual({ migrated: 0 });
  });
});
