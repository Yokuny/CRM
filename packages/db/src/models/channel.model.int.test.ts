import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../tests/helpers/db.helper.js';
import { encrypt } from '../crypto.helper.js';
import { Channel } from './channel.model.js';

const KEY = Buffer.alloc(32, 7).toString('base64');

const baseChannel = (Tenant: mongoose.Types.ObjectId, overrides: Partial<Record<string, unknown>> = {}) => ({
  Tenant,
  phoneNumberId: '1500000000',
  accessTokenEnc: encrypt('EAAG-token-da-meta', KEY),
  ...overrides,
});

describe('Channel model', () => {
  useTestDb();

  it('rejects a second Channel with the same phoneNumberId (unique index)', async () => {
    await Channel.init();
    await Channel.create(baseChannel(new mongoose.Types.ObjectId()));

    await expect(Channel.create(baseChannel(new mongoose.Types.ObjectId()))).rejects.toThrow();
  });

  it('rejects a second Channel for the same Tenant (unique index, v1: 1 channel per tenant)', async () => {
    await Channel.init();
    const Tenant = new mongoose.Types.ObjectId();
    await Channel.create(baseChannel(Tenant));

    await expect(Channel.create(baseChannel(Tenant, { phoneNumberId: '1500000001' }))).rejects.toThrow();
  });

  it('persists and reloads the 3 accessTokenEnc keys (ciphertext/iv/authTag)', async () => {
    const Tenant = new mongoose.Types.ObjectId();
    const secret = encrypt('EAAG-token-da-meta', KEY);
    await Channel.create(baseChannel(Tenant, { accessTokenEnc: secret }));

    const reloaded = await Channel.findOne({ Tenant }).lean();

    expect(reloaded?.accessTokenEnc).toEqual({
      ciphertext: secret.ciphertext,
      iv: secret.iv,
      authTag: secret.authTag,
    });
  });

  it('declares the {Tenant} and {phoneNumberId} unique indexes', async () => {
    await Channel.init();

    const indexes = await Channel.collection.indexes();
    const uniqueKeys = indexes.filter((index) => index.unique).map((index) => JSON.stringify(index.key));

    expect(uniqueKeys).toContain(JSON.stringify({ Tenant: 1 }));
    expect(uniqueKeys).toContain(JSON.stringify({ phoneNumberId: 1 }));
  });

  it('defaults status to active and stamps createdAt/updatedAt', async () => {
    const created = await Channel.create(baseChannel(new mongoose.Types.ObjectId()));

    expect(created.status).toBe('active');
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(created.updatedAt).toBeInstanceOf(Date);
  });
});
