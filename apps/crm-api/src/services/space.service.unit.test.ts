import type { CreateSpace, UpdateSpace } from '@crm/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpaceRecord } from '../repositories/space.repository.js';

const createSpaceMock = vi.fn();
const findByIdMock = vi.fn();
const updateSpaceMock = vi.fn();
const listSpacesMock = vi.fn();

vi.mock('../repositories/space.repository.js', () => ({
  createSpace: (...args: unknown[]) => createSpaceMock(...args),
  findById: (...args: unknown[]) => findByIdMock(...args),
  updateSpace: (...args: unknown[]) => updateSpaceMock(...args),
  listSpaces: (...args: unknown[]) => listSpacesMock(...args),
}));

const TENANT_ID = 'tenant-1';

const sampleRecord = (overrides: Partial<SpaceRecord> = {}): SpaceRecord => ({
  id: 'space-1',
  name: 'Sala 1',
  active: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

describe('space.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createSpace (spec.md SCH-04)', () => {
    it('calls the repository with the tenant-scoped data and returns its result', async () => {
      const { createSpace } = await import('./space.service.js');
      const record = sampleRecord();
      createSpaceMock.mockResolvedValueOnce(record);
      const input: CreateSpace = { name: 'Sala 1' };

      const result = await createSpace(TENANT_ID, input);

      expect(createSpaceMock).toHaveBeenCalledWith({ tenant: TENANT_ID, name: 'Sala 1' });
      expect(result).toBe(record);
    });
  });

  describe('getSpaceById (AD-010)', () => {
    it('throws SpaceNotFoundError when the repository finds no Space for this tenant/id', async () => {
      const { getSpaceById, SpaceNotFoundError } = await import('./space.service.js');
      findByIdMock.mockResolvedValueOnce(null);

      await expect(getSpaceById(TENANT_ID, 'missing-id')).rejects.toBeInstanceOf(SpaceNotFoundError);
    });

    it('returns the repository result when found', async () => {
      const { getSpaceById } = await import('./space.service.js');
      const record = sampleRecord();
      findByIdMock.mockResolvedValueOnce(record);

      const result = await getSpaceById(TENANT_ID, 'space-1');

      expect(result).toBe(record);
    });
  });

  describe('updateSpace (AD-010)', () => {
    it('throws SpaceNotFoundError when the repository finds no Space for this tenant/id', async () => {
      const { updateSpace, SpaceNotFoundError } = await import('./space.service.js');
      updateSpaceMock.mockResolvedValueOnce(null);

      await expect(updateSpace(TENANT_ID, 'missing-id', { active: false } as UpdateSpace)).rejects.toBeInstanceOf(
        SpaceNotFoundError,
      );
    });

    it('returns the repository result for a valid update', async () => {
      const { updateSpace } = await import('./space.service.js');
      const record = sampleRecord({ active: false });
      updateSpaceMock.mockResolvedValueOnce(record);

      const result = await updateSpace(TENANT_ID, 'space-1', { active: false });

      expect(updateSpaceMock).toHaveBeenCalledWith(TENANT_ID, 'space-1', { active: false });
      expect(result).toBe(record);
    });
  });

  describe('listSpaces', () => {
    it('clamps an out-of-range page/limit before delegating to the repository (CORE-12 convention)', async () => {
      const { listSpaces } = await import('./space.service.js');
      listSpacesMock.mockResolvedValueOnce({ items: [], total: 0 });

      await listSpaces(TENANT_ID, { page: -5, limit: 99999 });

      expect(listSpacesMock).toHaveBeenCalledWith(TENANT_ID, { page: 1, limit: 100, active: undefined });
    });

    it('passes the active filter through untouched and returns the repository result', async () => {
      const { listSpaces } = await import('./space.service.js');
      const repositoryResult = { items: [sampleRecord()], total: 1 };
      listSpacesMock.mockResolvedValueOnce(repositoryResult);

      const result = await listSpaces(TENANT_ID, { page: 2, limit: 10, active: false });

      expect(listSpacesMock).toHaveBeenCalledWith(TENANT_ID, { page: 2, limit: 10, active: false });
      expect(result).toBe(repositoryResult);
    });
  });
});
