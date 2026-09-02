import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../tests/helpers/db.helper.js';
import { Session } from './session.model.js';

const future = () => new Date(Date.now() + 60 * 60 * 1000);

describe('Session model', () => {
  useTestDb();

  it('declares a TTL index on expiresAt with expireAfterSeconds 0', async () => {
    await Session.init();

    const indexes = await Session.collection.indexes();
    const ttlIndex = indexes.find((index) => index.key.expiresAt === 1);

    expect(ttlIndex?.expireAfterSeconds).toBe(0);
  });

  it('deleteMany({user}) removes every session of that user and none of another', async () => {
    const userA = new mongoose.Types.ObjectId();
    const userB = new mongoose.Types.ObjectId();
    await Session.create([
      { user: userA, tokenHash: 'hash-a1', deviceInfo: 'ua-1', expiresAt: future() },
      { user: userA, tokenHash: 'hash-a2', deviceInfo: 'ua-2', expiresAt: future() },
      { user: userB, tokenHash: 'hash-b1', deviceInfo: 'ua-3', expiresAt: future() },
    ]);

    await Session.deleteMany({ user: userA });

    expect(await Session.countDocuments({ user: userA })).toBe(0);
    expect(await Session.countDocuments({ user: userB })).toBe(1);
  });
});
