import crypto from 'node:crypto';
import type { ScheduleWindow } from '@crm/db';
import { connect, disconnect, Professional } from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import * as professionalRepository from './professional.repository.js';

// Sem `mongoose` aqui (AD-010/boundary estrutural: só packages/db importa
// mongoose) — mesmo padrão de product.repository.int.test.ts.
const randomId = (): string => crypto.randomBytes(12).toString('hex');

const weekdayGrid: ScheduleWindow[] = [{ weekday: 1, start: '09:00', end: '12:00' }];

describe('professional.repository', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
  });

  afterEach(async () => {
    await Professional.deleteMany({});
  });

  afterAll(async () => {
    await disconnect();
  });

  describe('createProfessional', () => {
    it('persists Tenant from the tenant parameter, with active defaulting to true (spec.md SCH-01)', async () => {
      const tenantId = randomId();

      const result = await professionalRepository.createProfessional({
        tenant: tenantId,
        name: 'Dra. Ana',
        slotDurationMinutes: 30,
        weeklySchedule: weekdayGrid,
      });

      const persisted = await Professional.findById(result.id).lean();
      expect(persisted?.Tenant.toString()).toBe(tenantId);
      expect(result.active).toBe(true);
      expect(result.weeklySchedule).toEqual(weekdayGrid);
    });
  });

  describe('findById', () => {
    it("returns null for a Professional that belongs to a DIFFERENT tenant (AD-010)", async () => {
      const owner = randomId();
      const intruder = randomId();
      const created = await professionalRepository.createProfessional({
        tenant: owner,
        name: 'Dra. Ana',
        slotDurationMinutes: 30,
        weeklySchedule: weekdayGrid,
      });

      const result = await professionalRepository.findById(intruder, created.id);

      expect(result).toBeNull();
    });

    it('returns the Professional for its own tenant', async () => {
      const tenantId = randomId();
      const created = await professionalRepository.createProfessional({
        tenant: tenantId,
        name: 'Dra. Ana',
        slotDurationMinutes: 30,
        weeklySchedule: weekdayGrid,
      });

      const result = await professionalRepository.findById(tenantId, created.id);

      expect(result?.id).toBe(created.id);
      expect(result?.name).toBe('Dra. Ana');
    });
  });

  describe('updateProfessional', () => {
    it('updates only the fields provided, leaving the rest untouched (mirrors product.repository.updateProduct)', async () => {
      const tenantId = randomId();
      const created = await professionalRepository.createProfessional({
        tenant: tenantId,
        name: 'Dra. Ana',
        slotDurationMinutes: 30,
        weeklySchedule: weekdayGrid,
      });

      const result = await professionalRepository.updateProfessional(tenantId, created.id, {
        slotDurationMinutes: 45,
      });

      expect(result?.slotDurationMinutes).toBe(45);
      expect(result?.name).toBe('Dra. Ana');
      expect(result?.weeklySchedule).toEqual(weekdayGrid);
    });

    it('replaces weeklySchedule as a whole array when provided', async () => {
      const tenantId = randomId();
      const created = await professionalRepository.createProfessional({
        tenant: tenantId,
        name: 'Dra. Ana',
        slotDurationMinutes: 30,
        weeklySchedule: weekdayGrid,
      });
      const newGrid: ScheduleWindow[] = [{ weekday: 2, start: '14:00', end: '18:00' }];

      const result = await professionalRepository.updateProfessional(tenantId, created.id, {
        weeklySchedule: newGrid,
      });

      expect(result?.weeklySchedule).toEqual(newGrid);
    });

    it('sets active:false without touching other fields (spec.md SCH-05)', async () => {
      const tenantId = randomId();
      const created = await professionalRepository.createProfessional({
        tenant: tenantId,
        name: 'Dra. Ana',
        slotDurationMinutes: 30,
        weeklySchedule: weekdayGrid,
      });

      const result = await professionalRepository.updateProfessional(tenantId, created.id, { active: false });

      expect(result?.active).toBe(false);
      expect(result?.name).toBe('Dra. Ana');
    });

    it("returns null and leaves the Professional untouched for a DIFFERENT tenant's id (AD-010)", async () => {
      const owner = randomId();
      const intruder = randomId();
      const created = await professionalRepository.createProfessional({
        tenant: owner,
        name: 'Dra. Ana',
        slotDurationMinutes: 30,
        weeklySchedule: weekdayGrid,
      });

      const result = await professionalRepository.updateProfessional(intruder, created.id, {
        slotDurationMinutes: 60,
      });

      expect(result).toBeNull();
      const persisted = await Professional.findById(created.id).lean();
      expect(persisted?.slotDurationMinutes).toBe(30);
    });
  });

  describe('listProfessionals', () => {
    it('filters by active (spec.md SCH-05: "parar de oferecer horários" — listagem também respeita o filtro)', async () => {
      const tenantId = randomId();
      await professionalRepository.createProfessional({
        tenant: tenantId,
        name: 'Ativo',
        slotDurationMinutes: 30,
        weeklySchedule: weekdayGrid,
      });
      const inactive = await professionalRepository.createProfessional({
        tenant: tenantId,
        name: 'Inativo',
        slotDurationMinutes: 30,
        weeklySchedule: weekdayGrid,
      });
      await professionalRepository.updateProfessional(tenantId, inactive.id, { active: false });

      const result = await professionalRepository.listProfessionals(tenantId, { page: 1, limit: 20, active: false });

      expect(result.total).toBe(1);
      expect(result.items.map((item) => item.name)).toEqual(['Inativo']);
    });

    it("never returns another tenant's Professional and respects pagination (AD-010)", async () => {
      const tenantId = randomId();
      const otherTenant = randomId();
      await professionalRepository.createProfessional({
        tenant: otherTenant,
        name: 'De Outro Tenant',
        slotDurationMinutes: 30,
        weeklySchedule: weekdayGrid,
      });
      for (let i = 0; i < 3; i += 1) {
        await professionalRepository.createProfessional({
          tenant: tenantId,
          name: `Profissional ${i}`,
          slotDurationMinutes: 30,
          weeklySchedule: weekdayGrid,
        });
      }

      const result = await professionalRepository.listProfessionals(tenantId, { page: 1, limit: 2 });

      expect(result.total).toBe(3);
      expect(result.items).toHaveLength(2);
      expect(result.items.every((item) => item.name !== 'De Outro Tenant')).toBe(true);
    });
  });
});
