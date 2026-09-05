import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../tests/helpers/db.helper.js';
import { Process } from './process.model.js';

const baseProcess = (Tenant: mongoose.Types.ObjectId, overrides: Partial<Record<string, unknown>> = {}) => ({
  Tenant,
  customer: new mongoose.Types.ObjectId(),
  template: new mongoose.Types.ObjectId(),
  templateVersion: 1,
  stage: 'aguardando_pagamento',
  values: {},
  ...overrides,
});

describe('Process model', () => {
  useTestDb();

  it('declares the {Tenant,customer} and {Tenant,template,templateVersion} indexes', async () => {
    await Process.init();

    const indexes = await Process.collection.indexes();
    const keys = indexes.map((index) => JSON.stringify(index.key));

    expect(keys).toContain(JSON.stringify({ Tenant: 1, customer: 1 }));
    expect(keys).toContain(JSON.stringify({ Tenant: 1, template: 1, templateVersion: 1 }));
  });

  // Espelha exatamente o filtro que FieldValueStore.countByTemplateVersion/
  // migrateValues usa (AD-021/AD-024) — prova funcional, não só presença do
  // índice.
  it('returns only documents matching {Tenant,template,templateVersion}', async () => {
    const Tenant = new mongoose.Types.ObjectId();
    const otherTenant = new mongoose.Types.ObjectId();
    const template = new mongoose.Types.ObjectId();
    await Process.create(baseProcess(Tenant, { template, templateVersion: 1 }));
    await Process.create(baseProcess(Tenant, { template, templateVersion: 2 }));
    await Process.create(baseProcess(otherTenant, { template, templateVersion: 1 }));

    const matches = await Process.find({ Tenant, template, templateVersion: 1 }).lean();

    expect(matches).toHaveLength(1);
    expect(matches[0]?.templateVersion).toBe(1);
  });

  it('persists the customer reference and current stage', async () => {
    const customer = new mongoose.Types.ObjectId();
    const created = await Process.create(baseProcess(new mongoose.Types.ObjectId(), { customer }));

    const reloaded = await Process.findById(created._id).lean();

    expect(reloaded?.customer.toString()).toBe(customer.toString());
    expect(reloaded?.stage).toBe('aguardando_pagamento');
  });

  it('stamps createdAt/updatedAt via timestamps', async () => {
    const created = await Process.create(baseProcess(new mongoose.Types.ObjectId()));

    expect(created.createdAt).toBeInstanceOf(Date);
    expect(created.updatedAt).toBeInstanceOf(Date);
  });
});
