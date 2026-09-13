import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../tests/helpers/db.helper.js';
import { Card } from './card.model.js';

const baseCard = (
  Tenant: mongoose.Types.ObjectId,
  board: mongoose.Types.ObjectId,
  column: mongoose.Types.ObjectId,
  overrides: Partial<Record<string, unknown>> = {},
) => ({
  Tenant,
  board,
  column,
  title: 'Ligar para o cliente',
  position: 0,
  ...overrides,
});

describe('Card model', () => {
  useTestDb();

  it('persists a card with only the required fields, no optional reference set (KAN-13)', async () => {
    const Tenant = new mongoose.Types.ObjectId();
    const board = new mongoose.Types.ObjectId();
    const column = new mongoose.Types.ObjectId();

    const created = await Card.create(baseCard(Tenant, board, column));

    expect(created.title).toBe('Ligar para o cliente');
    expect(created.board).toEqual(board);
    expect(created.column).toEqual(column);
    expect(created.customer).toBeUndefined();
    expect(created.process).toBeUndefined();
    expect(created.order).toBeUndefined();
    expect(created.assignee).toBeUndefined();
  });

  it('persists a card with all 4 optional references set (KAN-14)', async () => {
    const Tenant = new mongoose.Types.ObjectId();
    const board = new mongoose.Types.ObjectId();
    const column = new mongoose.Types.ObjectId();
    const customer = new mongoose.Types.ObjectId();
    const process = new mongoose.Types.ObjectId();
    const order = new mongoose.Types.ObjectId();
    const assignee = new mongoose.Types.ObjectId();

    const created = await Card.create(baseCard(Tenant, board, column, { customer, process, order, assignee }));

    expect(created.customer).toEqual(customer);
    expect(created.process).toEqual(process);
    expect(created.order).toEqual(order);
    expect(created.assignee).toEqual(assignee);
  });

  it('rejects a document missing board', async () => {
    const Tenant = new mongoose.Types.ObjectId();
    const column = new mongoose.Types.ObjectId();

    await expect(Card.create({ Tenant, column, title: 'Sem board', position: 0 })).rejects.toThrow();
  });

  it('rejects a document missing column', async () => {
    const Tenant = new mongoose.Types.ObjectId();
    const board = new mongoose.Types.ObjectId();

    await expect(Card.create({ Tenant, board, title: 'Sem coluna', position: 0 })).rejects.toThrow();
  });

  it('rejects an empty title', async () => {
    const Tenant = new mongoose.Types.ObjectId();
    const board = new mongoose.Types.ObjectId();
    const column = new mongoose.Types.ObjectId();

    await expect(Card.create(baseCard(Tenant, board, column, { title: '' }))).rejects.toThrow();
  });

  it('declares the {Tenant, board, column, position} index', async () => {
    await Card.init();

    const indexes = await Card.collection.indexes();
    const keys = indexes.map((index) => JSON.stringify(index.key));

    expect(keys).toContain(JSON.stringify({ Tenant: 1, board: 1, column: 1, position: 1 }));
  });
});
