import crypto from 'node:crypto';
import type { MigrationPlan } from '@crm/contracts';
import { connect, disconnect, Process } from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createProcessFieldValueStore } from './process.fieldValueStore.js';

// Sem `mongoose` aqui (AD-010/boundary estrutural: só packages/db importa
// mongoose) — mesmo padrão de customer.fieldValueStore.int.test.ts (T10).
const randomId = (): string => crypto.randomBytes(12).toString('hex');

const baseProcess = (overrides: Partial<Record<string, unknown>> = {}) => ({
  Tenant: randomId(),
  customer: randomId(),
  template: randomId(),
  templateVersion: 1,
  stage: 'aberto',
  values: {},
  ...overrides,
});

describe('createProcessFieldValueStore', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
  });

  afterEach(async () => {
    await Process.deleteMany({});
  });

  afterAll(async () => {
    await disconnect();
  });

  describe('countByTemplateVersion', () => {
    it('counts only documents matching the exact {Tenant,template,version}', async () => {
      const store = createProcessFieldValueStore();
      const Tenant = randomId();
      const template = randomId();
      await Process.create(baseProcess({ Tenant, template, templateVersion: 1 }));
      await Process.create(baseProcess({ Tenant, template, templateVersion: 1 }));
      await Process.create(baseProcess({ Tenant, template, templateVersion: 2 }));
      await Process.create(baseProcess({ Tenant: randomId(), template, templateVersion: 1 }));
      await Process.create(baseProcess({ Tenant, template: randomId(), templateVersion: 1 }));

      const count = await store.countByTemplateVersion(Tenant, template, 1);

      expect(count).toBe(2);
    });
  });

  describe('migrateValues', () => {
    it('applies a discard action, removing the field from values and advancing templateVersion', async () => {
      const store = createProcessFieldValueStore();
      const Tenant = randomId();
      const template = randomId();
      const created = await Process.create(
        baseProcess({ Tenant, template, templateVersion: 1, values: { valor: 100, obs: 'nota antiga' } }),
      );
      const migration: MigrationPlan = { obs: { action: 'discard' } };

      const result = await store.migrateValues(Tenant, template, 1, 2, migration);

      expect(result).toEqual({ migrated: 1 });
      const reloaded = await Process.findById(created._id).lean();
      expect(reloaded?.values).toEqual({ valor: 100 });
      expect(reloaded?.templateVersion).toBe(2);
    });

    it('applies a mapField action, renaming the key while preserving its value', async () => {
      const store = createProcessFieldValueStore();
      const Tenant = randomId();
      const template = randomId();
      const created = await Process.create(
        baseProcess({ Tenant, template, templateVersion: 1, values: { valor: 100, obs: 'nota antiga' } }),
      );
      const migration: MigrationPlan = { obs: { action: 'mapField', toFieldId: 'observacao' } };

      const result = await store.migrateValues(Tenant, template, 1, 2, migration);

      expect(result).toEqual({ migrated: 1 });
      const reloaded = await Process.findById(created._id).lean();
      expect(reloaded?.values).toEqual({ valor: 100, observacao: 'nota antiga' });
    });

    it('applies a mapOptions action, remapping a mapped value', async () => {
      const store = createProcessFieldValueStore();
      const Tenant = randomId();
      const template = randomId();
      const created = await Process.create(
        baseProcess({ Tenant, template, templateVersion: 1, values: { prioridade: 'baixa' } }),
      );
      const migration: MigrationPlan = { prioridade: { action: 'mapOptions', mapping: { baixa: 'normal' } } };

      const result = await store.migrateValues(Tenant, template, 1, 2, migration);

      expect(result).toEqual({ migrated: 1 });
      const reloaded = await Process.findById(created._id).lean();
      expect(reloaded?.values).toEqual({ prioridade: 'normal' });
    });

    it('leaves a value untouched by mapOptions when it has no entry in mapping, never dropping it', async () => {
      const store = createProcessFieldValueStore();
      const Tenant = randomId();
      const template = randomId();
      const created = await Process.create(
        baseProcess({ Tenant, template, templateVersion: 1, values: { prioridade: 'alta' } }),
      );
      const migration: MigrationPlan = { prioridade: { action: 'mapOptions', mapping: { baixa: 'normal' } } };

      await store.migrateValues(Tenant, template, 1, 2, migration);

      const reloaded = await Process.findById(created._id).lean();
      expect(reloaded?.values).toEqual({ prioridade: 'alta' });
    });

    // AD-024: mesma prova de idempotência de customer.fieldValueStore (T10) —
    // reaplicar o mesmo (fromVersion,toVersion) só acha documentos ainda não
    // migrados.
    it('migrates 0 documents on a retry with the same (fromVersion,toVersion) after a first successful call (AD-024)', async () => {
      const store = createProcessFieldValueStore();
      const Tenant = randomId();
      const template = randomId();
      await Process.create(baseProcess({ Tenant, template, templateVersion: 1, values: { obs: 'nota' } }));
      const migration: MigrationPlan = { obs: { action: 'discard' } };

      const first = await store.migrateValues(Tenant, template, 1, 2, migration);
      const second = await store.migrateValues(Tenant, template, 1, 2, migration);

      expect(first).toEqual({ migrated: 1 });
      expect(second).toEqual({ migrated: 0 });
    });
  });
});
