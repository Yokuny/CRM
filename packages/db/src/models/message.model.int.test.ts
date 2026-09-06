import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../tests/helpers/db.helper.js';
import { Message } from './message.model.js';

const baseIds = () => ({
  Tenant: new mongoose.Types.ObjectId(),
  Conversation: new mongoose.Types.ObjectId(),
  Channel: new mongoose.Types.ObjectId(),
  Customer: new mongoose.Types.ObjectId(),
});

describe('Message model', () => {
  useTestDb();

  it('coexists two out messages without wamid (sparse unique index)', async () => {
    await Message.init();
    const ids = baseIds();

    const first = await Message.create({ ...ids, direction: 'out', type: 'text', status: 'queued', text: 'oi' });
    const second = await Message.create({ ...ids, direction: 'out', type: 'text', status: 'queued', text: 'olá' });

    expect(first.wamid).toBeUndefined();
    expect(second.wamid).toBeUndefined();
  });

  it('rejects a second Message with the same wamid (unique index)', async () => {
    await Message.init();
    const ids = baseIds();
    await Message.create({ ...ids, direction: 'in', type: 'text', text: 'oi', wamid: 'wamid-1' });

    await expect(
      Message.create({ ...ids, direction: 'in', type: 'text', text: 'oi de novo', wamid: 'wamid-1' }),
    ).rejects.toThrow();
  });

  it('persists direction:"in" without status (status required only for "out")', async () => {
    const message = await Message.create({ ...baseIds(), direction: 'in', type: 'text', text: 'oi' });

    expect(message.status).toBeUndefined();
  });

  it('rejects direction:"out" without status', async () => {
    await expect(Message.create({ ...baseIds(), direction: 'out', type: 'text', text: 'oi' })).rejects.toThrow();
  });

  it('declares the {Tenant,Conversation,createdAt} and {status,createdAt} indexes', async () => {
    await Message.init();

    const indexes = await Message.collection.indexes();
    const keys = indexes.map((index) => JSON.stringify(index.key));

    expect(keys).toContain(JSON.stringify({ Tenant: 1, Conversation: 1, createdAt: 1 }));
    expect(keys).toContain(JSON.stringify({ status: 1, createdAt: 1 }));
  });

  it('declares wamid as a sparse unique index', async () => {
    await Message.init();

    const indexes = await Message.collection.indexes();
    const wamidIndex = indexes.find((index) => JSON.stringify(index.key) === JSON.stringify({ wamid: 1 }));

    expect(wamidIndex?.unique).toBe(true);
    expect(wamidIndex?.sparse).toBe(true);
  });
});
