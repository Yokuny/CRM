import crypto from 'node:crypto';
import { connect, disconnect, Space } from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import * as spaceRepository from './space.repository.js';

// Sem `mongoose` aqui (AD-010/boundary estrutural: só packages/db importa
// mongoose) — mesmo padrão de product.repository.int.test.ts.
const randomId = (): string => crypto.randomBytes(12).toString('hex');

describe('space.repository', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
  });

  afterEach(async () => {
    await Space.deleteMany({});
  });

  afterAll(async () => {
    await disconnect();
  });

  describe('createSpace', () => {
    it('persists Tenant from the tenant parameter, with active defaulting to true (spec.md SCH-04)', async () => {
      const tenantId = randomId();

      const result = await spaceRepository.createSpace({ tenant: tenantId, name: 'Sala 1' });

      const persisted = await Space.findById(result.id).lean();
      expect(persisted?.Tenant.toString()).toBe(tenantId);
      expect(result.active).toBe(true);
    });
  });

  describe('findById', () => {
    it('returns null for a Space that belongs to a DIFFERENT tenant (AD-010)', async () => {
      const owner = randomId();
      const intruder = randomId();
      const created = await spaceRepository.createSpace({ tenant: owner, name: 'Sala 1' });

      const result = await spaceRepository.findById(intruder, created.id);

      expect(result).toBeNull();
    });

    it('returns the Space for its own tenant', async () => {
      const tenantId = randomId();
      const created = await spaceRepository.createSpace({ tenant: tenantId, name: 'Sala 1' });

      const result = await spaceRepository.findById(tenantId, created.id);

      expect(result?.id).toBe(created.id);
      expect(result?.name).toBe('Sala 1');
    });
  });

  describe('updateSpace', () => {
    it('updates only the fields provided, leaving the rest untouched (mirrors product.repository.updateProduct)', async () => {
      const tenantId = randomId();
      const created = await spaceRepository.createSpace({ tenant: tenantId, name: 'Sala 1' });

      const result = await spaceRepository.updateSpace(tenantId, created.id, { active: false });

      expect(result?.active).toBe(false);
      expect(result?.name).toBe('Sala 1');
    });

    it("returns null and leaves the Space untouched for a DIFFERENT tenant's id (AD-010)", async () => {
      const owner = randomId();
      const intruder = randomId();
      const created = await spaceRepository.createSpace({ tenant: owner, name: 'Sala 1' });

      const result = await spaceRepository.updateSpace(intruder, created.id, { name: 'Invadida' });

      expect(result).toBeNull();
      const persisted = await Space.findById(created.id).lean();
      expect(persisted?.name).toBe('Sala 1');
    });
  });

  describe('listSpaces', () => {
    it('filters by active (spec.md SCH-04)', async () => {
      const tenantId = randomId();
      await spaceRepository.createSpace({ tenant: tenantId, name: 'Ativa' });
      const inactive = await spaceRepository.createSpace({ tenant: tenantId, name: 'Inativa' });
      await spaceRepository.updateSpace(tenantId, inactive.id, { active: false });

      const result = await spaceRepository.listSpaces(tenantId, { page: 1, limit: 20, active: false });

      expect(result.total).toBe(1);
      expect(result.items.map((item) => item.name)).toEqual(['Inativa']);
    });

    it("never returns another tenant's Space and respects pagination (AD-010)", async () => {
      const tenantId = randomId();
      const otherTenant = randomId();
      await spaceRepository.createSpace({ tenant: otherTenant, name: 'De Outro Tenant' });
      for (let i = 0; i < 3; i += 1) {
        await spaceRepository.createSpace({ tenant: tenantId, name: `Sala ${i}` });
      }

      const result = await spaceRepository.listSpaces(tenantId, { page: 1, limit: 2 });

      expect(result.total).toBe(3);
      expect(result.items).toHaveLength(2);
      expect(result.items.every((item) => item.name !== 'De Outro Tenant')).toBe(true);
    });
  });
});
