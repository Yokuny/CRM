import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../tests/helpers/db.helper.js';
import { hashToken, Invite } from './invite.model.js';

const future = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

describe('Invite model', () => {
  useTestDb();

  it('rejects a second pending invite for the same Tenant+email pair (partial unique index)', async () => {
    await Invite.init();
    const tenant = new mongoose.Types.ObjectId();
    const invitedBy = new mongoose.Types.ObjectId();
    const common = {
      Tenant: tenant,
      email: 'convidado@example.com',
      role: 'admin' as const,
      invitedBy,
      expiresAt: future(),
    };

    await Invite.create({ ...common, tokenHash: hashToken('token-1'), status: 'pending' });

    await expect(Invite.create({ ...common, tokenHash: hashToken('token-2'), status: 'pending' })).rejects.toThrow();
  });

  it('hashToken is deterministic for the same input', () => {
    expect(hashToken('mesmo-token')).toBe(hashToken('mesmo-token'));
  });

  it('does not declare a TTL index on expiresAt (expiration is logical, by design)', async () => {
    const indexes = await Invite.collection.indexes();

    const ttlIndex = indexes.find((index) => 'expireAfterSeconds' in index);

    expect(ttlIndex).toBeUndefined();
  });
});
