import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../tests/helpers/db.helper.js';
import { Conversation, claimTurnLock, releaseTurnLock } from './conversation.model.js';

const baseConversation = (overrides: Partial<Record<string, unknown>> = {}) => ({
  Tenant: new mongoose.Types.ObjectId(),
  Channel: new mongoose.Types.ObjectId(),
  Customer: new mongoose.Types.ObjectId(),
  ...overrides,
});

describe('Conversation model', () => {
  useTestDb();

  it('rejects a second Conversation with the same {Channel,Customer} pair (unique index)', async () => {
    await Conversation.init();
    const Channel = new mongoose.Types.ObjectId();
    const Customer = new mongoose.Types.ObjectId();
    await Conversation.create(baseConversation({ Channel, Customer }));

    await expect(Conversation.create(baseConversation({ Channel, Customer }))).rejects.toThrow();
  });

  it('accepts turnLock as null (free) and as {holder,claimedAt} (claimed)', async () => {
    const free = await Conversation.create(baseConversation());
    expect(free.turnLock).toBeNull();

    const claimedAt = new Date();
    const claimed = await Conversation.create(baseConversation({ turnLock: { holder: 'req-1', claimedAt } }));
    expect(claimed.turnLock?.holder).toBe('req-1');
    expect(claimed.turnLock?.claimedAt.getTime()).toBe(claimedAt.getTime());
  });

  it('claims a free turnLock via the atomic findOneAndUpdate guard', async () => {
    const conversation = await Conversation.create(baseConversation());

    const claimed = await claimTurnLock(conversation._id.toString(), 'req-1');

    expect(claimed?.turnLock).toEqual(expect.objectContaining({ holder: 'req-1' }));
  });

  it('returns null on a second claim attempt over an already-claimed turnLock', async () => {
    const conversation = await Conversation.create(baseConversation());
    const firstClaim = await claimTurnLock(conversation._id.toString(), 'req-1');
    expect(firstClaim).not.toBeNull();

    const secondClaim = await claimTurnLock(conversation._id.toString(), 'req-2');

    expect(secondClaim).toBeNull();
  });

  it('releases a claimed turnLock back to null', async () => {
    const conversation = await Conversation.create(baseConversation());
    await claimTurnLock(conversation._id.toString(), 'req-1');

    const released = await releaseTurnLock(conversation._id.toString());

    expect(released?.turnLock).toBeNull();
  });

  it('declares the {Tenant,mode,lastActivityAt} index (idle sweep support)', async () => {
    await Conversation.init();

    const indexes = await Conversation.collection.indexes();
    const keys = indexes.map((index) => JSON.stringify(index.key));

    expect(keys).toContain(JSON.stringify({ Tenant: 1, mode: 1, lastActivityAt: 1 }));
  });
});
