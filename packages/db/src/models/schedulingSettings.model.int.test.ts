import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../tests/helpers/db.helper.js';
import { SchedulingSettings } from './schedulingSettings.model.js';

describe('SchedulingSettings model', () => {
  useTestDb();

  it('rejects a second document for the same Tenant (unique index, SCH-06)', async () => {
    await SchedulingSettings.init();
    const Tenant = new mongoose.Types.ObjectId();
    await SchedulingSettings.create({ Tenant, maxSlotsPerResponse: 10 });

    await expect(SchedulingSettings.create({ Tenant, maxSlotsPerResponse: 20 })).rejects.toMatchObject({ code: 11000 });
  });

  it('defaults maxSlotsPerResponse to 16 when omitted', async () => {
    const created = await SchedulingSettings.create({ Tenant: new mongoose.Types.ObjectId() });

    expect(created.maxSlotsPerResponse).toBe(16);
  });

  it('rejects maxSlotsPerResponse outside 1..50', async () => {
    await expect(SchedulingSettings.create({ Tenant: new mongoose.Types.ObjectId(), maxSlotsPerResponse: 0 })).rejects.toThrow();
    await expect(SchedulingSettings.create({ Tenant: new mongoose.Types.ObjectId(), maxSlotsPerResponse: 51 })).rejects.toThrow();
  });

  it('accepts the boundaries of maxSlotsPerResponse (1 and 50)', async () => {
    const lower = await SchedulingSettings.create({ Tenant: new mongoose.Types.ObjectId(), maxSlotsPerResponse: 1 });
    const upper = await SchedulingSettings.create({ Tenant: new mongoose.Types.ObjectId(), maxSlotsPerResponse: 50 });

    expect(lower.maxSlotsPerResponse).toBe(1);
    expect(upper.maxSlotsPerResponse).toBe(50);
  });
});
