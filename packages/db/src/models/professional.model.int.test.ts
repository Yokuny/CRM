import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../tests/helpers/db.helper.js';
import { Professional } from './professional.model.js';

const baseProfessional = (Tenant: mongoose.Types.ObjectId, overrides: Partial<Record<string, unknown>> = {}) => ({
  Tenant,
  name: 'Dra. Ana',
  slotDurationMinutes: 30,
  weeklySchedule: [{ weekday: 1, start: '09:00', end: '12:00' }],
  ...overrides,
});

describe('Professional model', () => {
  useTestDb();

  it('rejects a document missing name/slotDurationMinutes/weeklySchedule (SCH-01)', async () => {
    const Tenant = new mongoose.Types.ObjectId();

    await expect(Professional.create({ Tenant, slotDurationMinutes: 30, weeklySchedule: [] })).rejects.toThrow();
    await expect(Professional.create({ Tenant, name: 'Dra. Ana', weeklySchedule: [] })).rejects.toThrow();
    await expect(Professional.create({ Tenant, name: 'Dra. Ana', slotDurationMinutes: 30 })).rejects.toThrow();
  });

  it('persists name/slotDurationMinutes/weeklySchedule scoped to Tenant when all required fields are present (SCH-01)', async () => {
    const Tenant = new mongoose.Types.ObjectId();

    const created = await Professional.create(baseProfessional(Tenant));

    expect(created.Tenant).toEqual(Tenant);
    expect(created.name).toBe('Dra. Ana');
    expect(created.slotDurationMinutes).toBe(30);
    expect(created.toObject().weeklySchedule).toEqual([{ weekday: 1, start: '09:00', end: '12:00' }]);
  });

  it('rejects slotDurationMinutes outside 5..480', async () => {
    const Tenant = new mongoose.Types.ObjectId();

    await expect(Professional.create(baseProfessional(Tenant, { slotDurationMinutes: 4 }))).rejects.toThrow();
    await expect(Professional.create(baseProfessional(Tenant, { slotDurationMinutes: 481 }))).rejects.toThrow();
  });

  it('accepts the boundaries of slotDurationMinutes (5 and 480)', async () => {
    const Tenant = new mongoose.Types.ObjectId();

    const lower = await Professional.create(baseProfessional(Tenant, { slotDurationMinutes: 5 }));
    const upper = await Professional.create(baseProfessional(Tenant, { slotDurationMinutes: 480 }));

    expect(lower.slotDurationMinutes).toBe(5);
    expect(upper.slotDurationMinutes).toBe(480);
  });

  it('rejects a weeklySchedule entry with weekday outside 0..6', async () => {
    const Tenant = new mongoose.Types.ObjectId();

    await expect(
      Professional.create(baseProfessional(Tenant, { weeklySchedule: [{ weekday: 7, start: '09:00', end: '10:00' }] })),
    ).rejects.toThrow();
    await expect(
      Professional.create(baseProfessional(Tenant, { weeklySchedule: [{ weekday: -1, start: '09:00', end: '10:00' }] })),
    ).rejects.toThrow();
  });

  it('defaults active to true when omitted', async () => {
    const Tenant = new mongoose.Types.ObjectId();

    const created = await Professional.create(baseProfessional(Tenant));

    expect(created.active).toBe(true);
  });

  it('declares the {Tenant, active} index', async () => {
    await Professional.init();

    const indexes = await Professional.collection.indexes();
    const keys = indexes.map((index) => JSON.stringify(index.key));

    expect(keys).toContain(JSON.stringify({ Tenant: 1, active: 1 }));
  });
});
