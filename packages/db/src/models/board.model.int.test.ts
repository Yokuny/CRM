import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../tests/helpers/db.helper.js';
import { Board } from './board.model.js';

const baseBoard = (Tenant: mongoose.Types.ObjectId, overrides: Partial<Record<string, unknown>> = {}) => ({
  Tenant,
  name: 'Cobranças em atraso',
  columns: [{ label: 'A fazer', order: 0 }],
  ...overrides,
});

describe('Board model', () => {
  useTestDb();

  it('persists name/columns scoped to Tenant when all required fields are present (KAN-01)', async () => {
    const Tenant = new mongoose.Types.ObjectId();

    const created = await Board.create(
      baseBoard(Tenant, {
        columns: [
          { label: 'A fazer', order: 0 },
          { label: 'Em andamento', order: 1, color: '#FF00AA' },
        ],
      }),
    );

    expect(created.Tenant).toEqual(Tenant);
    expect(created.name).toBe('Cobranças em atraso');
    const columns = created.toObject().columns;
    expect(columns).toHaveLength(2);
    expect(columns[0]?.label).toBe('A fazer');
    expect(columns[1]?.color).toBe('#FF00AA');
  });

  it('rejects a document missing Tenant', async () => {
    await expect(Board.create({ name: 'Sem tenant', columns: [{ label: 'A fazer', order: 0 }] })).rejects.toThrow();
  });

  it('rejects a column with an empty label', async () => {
    const Tenant = new mongoose.Types.ObjectId();

    await expect(Board.create(baseBoard(Tenant, { columns: [{ label: '', order: 0 }] }))).rejects.toThrow();
  });

  it('accepts a column without color (color is optional)', async () => {
    const Tenant = new mongoose.Types.ObjectId();

    const created = await Board.create(baseBoard(Tenant));

    expect(created.toObject().columns[0]?.color).toBeUndefined();
  });

  it('rejects a column color that does not match #RRGGBB', async () => {
    const Tenant = new mongoose.Types.ObjectId();

    await expect(
      Board.create(baseBoard(Tenant, { columns: [{ label: 'A fazer', order: 0, color: 'red' }] })),
    ).rejects.toThrow();
  });

  it('declares the {Tenant, updatedAt} index (KAN-03)', async () => {
    await Board.init();

    const indexes = await Board.collection.indexes();
    const keys = indexes.map((index) => JSON.stringify(index.key));

    expect(keys).toContain(JSON.stringify({ Tenant: 1, updatedAt: -1 }));
  });
});
