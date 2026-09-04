import crypto from 'node:crypto';
import type { MigrationPlan } from '@crm/contracts';
import { Customer, connect, disconnect } from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createCustomerFieldValueStore } from './customer.fieldValueStore.js';

// Sem `mongoose` aqui (AD-010/boundary estrutural: só packages/db importa
// mongoose) — um ObjectId "de mentira" como string hex de 24 chars é o que os
// outros testes deste app já usam (ex.: noop.fieldValueStore.unit.test.ts).
const randomId = (): string => crypto.randomBytes(12).toString('hex');

const baseCustomer = (overrides: Partial<Record<string, unknown>> = {}) => ({
  Tenant: randomId(),
  name: 'Maria Silva',
  phone: '11912345678',
  template: randomId(),
  templateVersion: 1,
  values: { status: 'novo' },
  ...overrides,
});

describe('createCustomerFieldValueStore', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
  });

  afterEach(async () => {
    await Customer.deleteMany({});
  });

  afterAll(async () => {
    await disconnect();
  });

  describe('countByTemplateVersion', () => {
    it('counts only documents matching the exact {Tenant,template,version}', async () => {
      const store = createCustomerFieldValueStore();
      const Tenant = randomId();
      const template = randomId();
      await Customer.create(baseCustomer({ Tenant, template, templateVersion: 1 }));
      await Customer.create(baseCustomer({ Tenant, template, templateVersion: 1, name: 'Segundo' }));
      await Customer.create(baseCustomer({ Tenant, template, templateVersion: 2 }));
      await Customer.create(baseCustomer({ Tenant: randomId(), template, templateVersion: 1 }));
      await Customer.create(baseCustomer({ Tenant, template: randomId(), templateVersion: 1 }));

      const count = await store.countByTemplateVersion(Tenant, template, 1);

      expect(count).toBe(2);
    });
  });

  describe('migrateValues', () => {
    it('applies a discard action, removing the field from values and advancing templateVersion', async () => {
      const store = createCustomerFieldValueStore();
      const Tenant = randomId();
      const template = randomId();
      const created = await Customer.create(
        baseCustomer({ Tenant, template, templateVersion: 1, values: { status: 'novo', obs: 'nota antiga' } }),
      );
      const migration: MigrationPlan = { obs: { action: 'discard' } };

      const result = await store.migrateValues(Tenant, template, 1, 2, migration);

      expect(result).toEqual({ migrated: 1 });
      const reloaded = await Customer.findById(created._id).lean();
      expect(reloaded?.values).toEqual({ status: 'novo' });
      expect(reloaded?.templateVersion).toBe(2);
    });

    it('applies a mapField action, renaming the key while preserving its value', async () => {
      const store = createCustomerFieldValueStore();
      const Tenant = randomId();
      const template = randomId();
      const created = await Customer.create(
        baseCustomer({ Tenant, template, templateVersion: 1, values: { status: 'novo', obs: 'nota antiga' } }),
      );
      const migration: MigrationPlan = { obs: { action: 'mapField', toFieldId: 'observacao' } };

      const result = await store.migrateValues(Tenant, template, 1, 2, migration);

      expect(result).toEqual({ migrated: 1 });
      const reloaded = await Customer.findById(created._id).lean();
      expect(reloaded?.values).toEqual({ status: 'novo', observacao: 'nota antiga' });
    });

    it('applies a mapOptions action, remapping a mapped value', async () => {
      const store = createCustomerFieldValueStore();
      const Tenant = randomId();
      const template = randomId();
      const created = await Customer.create(
        baseCustomer({ Tenant, template, templateVersion: 1, values: { status: 'inativo' } }),
      );
      const migration: MigrationPlan = { status: { action: 'mapOptions', mapping: { inativo: 'arquivado' } } };

      const result = await store.migrateValues(Tenant, template, 1, 2, migration);

      expect(result).toEqual({ migrated: 1 });
      const reloaded = await Customer.findById(created._id).lean();
      expect(reloaded?.values).toEqual({ status: 'arquivado' });
    });

    it('leaves a value untouched by mapOptions when it has no entry in mapping, never dropping it', async () => {
      const store = createCustomerFieldValueStore();
      const Tenant = randomId();
      const template = randomId();
      const created = await Customer.create(
        baseCustomer({ Tenant, template, templateVersion: 1, values: { status: 'ativo' } }),
      );
      const migration: MigrationPlan = { status: { action: 'mapOptions', mapping: { inativo: 'arquivado' } } };

      await store.migrateValues(Tenant, template, 1, 2, migration);

      const reloaded = await Customer.findById(created._id).lean();
      expect(reloaded?.values).toEqual({ status: 'ativo' });
    });

    // AD-024: a segurança de uma migração destrutiva sem transação nativa vem
    // do PRÓPRIO filtro — reaplicar o mesmo (fromVersion,toVersion) só acha
    // documentos ainda não migrados, então uma retentativa converge sozinha.
    it('migrates 0 documents on a retry with the same (fromVersion,toVersion) after a first successful call (AD-024)', async () => {
      const store = createCustomerFieldValueStore();
      const Tenant = randomId();
      const template = randomId();
      await Customer.create(baseCustomer({ Tenant, template, templateVersion: 1, values: { obs: 'nota' } }));
      const migration: MigrationPlan = { obs: { action: 'discard' } };

      const first = await store.migrateValues(Tenant, template, 1, 2, migration);
      const second = await store.migrateValues(Tenant, template, 1, 2, migration);

      expect(first).toEqual({ migrated: 1 });
      expect(second).toEqual({ migrated: 0 });
    });
  });
});
