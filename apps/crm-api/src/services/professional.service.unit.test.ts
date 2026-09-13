import type { CreateProfessional, UpdateProfessional } from '@crm/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfessionalRecord } from '../repositories/professional.repository.js';

const createProfessionalMock = vi.fn();
const findByIdMock = vi.fn();
const updateProfessionalMock = vi.fn();
const listProfessionalsMock = vi.fn();

vi.mock('../repositories/professional.repository.js', () => ({
  createProfessional: (...args: unknown[]) => createProfessionalMock(...args),
  findById: (...args: unknown[]) => findByIdMock(...args),
  updateProfessional: (...args: unknown[]) => updateProfessionalMock(...args),
  listProfessionals: (...args: unknown[]) => listProfessionalsMock(...args),
}));

const TENANT_ID = 'tenant-1';

const sampleRecord = (overrides: Partial<ProfessionalRecord> = {}): ProfessionalRecord => ({
  id: 'professional-1',
  name: 'Dra. Ana',
  slotDurationMinutes: 30,
  weeklySchedule: [{ weekday: 1, start: '09:00', end: '12:00' }],
  active: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

describe('professional.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createProfessional (spec.md SCH-01)', () => {
    it('calls the repository with the tenant-scoped data and returns its result', async () => {
      const { createProfessional } = await import('./professional.service.js');
      const record = sampleRecord();
      createProfessionalMock.mockResolvedValueOnce(record);
      const input: CreateProfessional = {
        name: 'Dra. Ana',
        slotDurationMinutes: 30,
        weeklySchedule: [{ weekday: 1, start: '09:00', end: '12:00' }],
      };

      const result = await createProfessional(TENANT_ID, input);

      expect(createProfessionalMock).toHaveBeenCalledWith({
        tenant: TENANT_ID,
        name: 'Dra. Ana',
        slotDurationMinutes: 30,
        weeklySchedule: [{ weekday: 1, start: '09:00', end: '12:00' }],
      });
      expect(result).toBe(record);
    });
  });

  describe('getProfessionalById (AD-010)', () => {
    it('throws ProfessionalNotFoundError when the repository finds no Professional for this tenant/id', async () => {
      const { getProfessionalById, ProfessionalNotFoundError } = await import('./professional.service.js');
      findByIdMock.mockResolvedValueOnce(null);

      await expect(getProfessionalById(TENANT_ID, 'missing-id')).rejects.toBeInstanceOf(ProfessionalNotFoundError);
    });

    it('returns the repository result when found', async () => {
      const { getProfessionalById } = await import('./professional.service.js');
      const record = sampleRecord();
      findByIdMock.mockResolvedValueOnce(record);

      const result = await getProfessionalById(TENANT_ID, 'professional-1');

      expect(result).toBe(record);
    });
  });

  describe('updateProfessional (spec.md SCH-05, AD-010)', () => {
    it('throws ProfessionalNotFoundError when the repository finds no Professional for this tenant/id', async () => {
      const { updateProfessional, ProfessionalNotFoundError } = await import('./professional.service.js');
      updateProfessionalMock.mockResolvedValueOnce(null);

      await expect(
        updateProfessional(TENANT_ID, 'missing-id', { active: false } as UpdateProfessional),
      ).rejects.toBeInstanceOf(ProfessionalNotFoundError);
    });

    it('returns the repository result for a valid update', async () => {
      const { updateProfessional } = await import('./professional.service.js');
      const record = sampleRecord({ active: false });
      updateProfessionalMock.mockResolvedValueOnce(record);

      const result = await updateProfessional(TENANT_ID, 'professional-1', { active: false });

      expect(updateProfessionalMock).toHaveBeenCalledWith(TENANT_ID, 'professional-1', { active: false });
      expect(result).toBe(record);
    });
  });

  describe('listProfessionals', () => {
    it('clamps an out-of-range page/limit before delegating to the repository (CORE-12 convention)', async () => {
      const { listProfessionals } = await import('./professional.service.js');
      listProfessionalsMock.mockResolvedValueOnce({ items: [], total: 0 });

      await listProfessionals(TENANT_ID, { page: -5, limit: 99999 });

      expect(listProfessionalsMock).toHaveBeenCalledWith(TENANT_ID, {
        page: 1,
        limit: 100,
        active: undefined,
      });
    });

    it('passes the active filter through untouched and returns the repository result', async () => {
      const { listProfessionals } = await import('./professional.service.js');
      const repositoryResult = { items: [sampleRecord()], total: 1 };
      listProfessionalsMock.mockResolvedValueOnce(repositoryResult);

      const result = await listProfessionals(TENANT_ID, { page: 2, limit: 10, active: false });

      expect(listProfessionalsMock).toHaveBeenCalledWith(TENANT_ID, { page: 2, limit: 10, active: false });
      expect(result).toBe(repositoryResult);
    });
  });
});
