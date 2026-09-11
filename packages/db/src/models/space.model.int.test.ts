import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../tests/helpers/db.helper.js';
import { Space } from './space.model.js';

const baseSpace = (Tenant: mongoose.Types.ObjectId, overrides: Partial<Record<string, unknown>> = {}) => ({
  Tenant,
  name: 'Sala 1',
  ...overrides,
});

describe('Space model', () => {
  useTestDb();

  it('rejects a document without name (SCH-04)', async () => {
    const Tenant = new mongoose.Types.ObjectId();

    await expect(Space.create({ Tenant })).rejects.toThrow();
  });

  it('persists name scoped to Tenant (SCH-04)', async () => {
    const Tenant = new mongoose.Types.ObjectId();

    const created = await Space.create(baseSpace(Tenant));

    expect(created.Tenant).toEqual(Tenant);
    expect(created.name).toBe('Sala 1');
  });

  it('defaults active to true when omitted', async () => {
    const Tenant = new mongoose.Types.ObjectId();

    const created = await Space.create(baseSpace(Tenant));

    expect(created.active).toBe(true);
  });

  it('declares the {Tenant, active} index', async () => {
    await Space.init();

    const indexes = await Space.collection.indexes();
    const keys = indexes.map((index) => JSON.stringify(index.key));

    expect(keys).toContain(JSON.stringify({ Tenant: 1, active: 1 }));
  });
});
