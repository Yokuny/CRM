import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../tests/helpers/db.helper.js';
import { User } from './user.model.js';

describe('User model', () => {
  useTestDb();

  it('rejects a duplicate e-mail, case-insensitively, via the unique index', async () => {
    await User.init();
    const tenant = new mongoose.Types.ObjectId();
    await User.create({
      name: 'Ana',
      email: 'Ana@Example.com',
      password: 'hash',
      Tenant: tenant,
      role: ['admin'],
    });

    await expect(
      User.create({ name: 'Ana 2', email: 'ana@example.com', password: 'hash2', Tenant: tenant, role: ['admin'] }),
    ).rejects.toThrow();
  });

  it('fails schema validation when Tenant is absent and isPlatformAdmin is not true', async () => {
    const user = new User({ name: 'Sem Tenant', email: 'sem-tenant@example.com', password: 'hash', role: ['admin'] });

    await expect(user.validate()).rejects.toThrow();
  });

  it('allows Tenant to be absent when isPlatformAdmin is true (AD-016)', async () => {
    const user = new User({
      name: 'Admin da Plataforma',
      email: 'platform-admin@example.com',
      password: 'hash',
      isPlatformAdmin: true,
      role: [],
    });

    await expect(user.validate()).resolves.toBeUndefined();
  });
});
