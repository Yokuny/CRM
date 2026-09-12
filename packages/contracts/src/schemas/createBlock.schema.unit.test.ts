import { describe, expect, it } from 'vitest';
import { createBlockSchema } from './createBlock.schema.js';

const validId = '507f1f77bcf86cd799439011';

const basePayload = {
  professionalId: validId,
  startDate: '2026-09-15',
  startTime: '12:00',
  endDate: '2026-09-15',
  endTime: '13:00',
  title: 'Almoço',
};

describe('createBlockSchema (SCH-33, AD-036)', () => {
  it('accepts a valid same-day block', () => {
    expect(createBlockSchema.safeParse(basePayload).success).toBe(true);
  });

  it('accepts a block spanning midnight (endDate after startDate)', () => {
    const result = createBlockSchema.safeParse({
      ...basePayload,
      startDate: '2026-09-15',
      startTime: '23:00',
      endDate: '2026-09-16',
      endTime: '01:00',
    });
    expect(result.success).toBe(true);
  });

  it('rejects end <= start on the same day', () => {
    const equal = createBlockSchema.safeParse({ ...basePayload, endDate: '2026-09-15', endTime: '12:00' });
    expect(equal.success).toBe(false);

    const before = createBlockSchema.safeParse({ ...basePayload, endTime: '11:00' });
    expect(before.success).toBe(false);
  });

  it('rejects end date before start date, even with a later time', () => {
    const result = createBlockSchema.safeParse({
      ...basePayload,
      startDate: '2026-09-16',
      startTime: '09:00',
      endDate: '2026-09-15',
      endTime: '23:00',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an ISO instant in place of any date/time field', () => {
    const result = createBlockSchema.safeParse({ ...basePayload, startDate: '2026-09-15T12:00:00.000Z' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty or overlong title', () => {
    expect(createBlockSchema.safeParse({ ...basePayload, title: '' }).success).toBe(false);
    expect(createBlockSchema.safeParse({ ...basePayload, title: 'x'.repeat(121) }).success).toBe(false);
  });

  it('rejects an invalid professionalId', () => {
    expect(createBlockSchema.safeParse({ ...basePayload, professionalId: 'not-an-id' }).success).toBe(false);
  });

  it('rejects every tenant-forging key in the body (AD-010, .strict())', () => {
    for (const forged of ['Tenant', 'tenantId', 'orgId']) {
      const result = createBlockSchema.safeParse({ ...basePayload, [forged]: 'forjado' });
      expect(result.success, `${forged} deveria ser rejeitado`).toBe(false);
    }
  });
});
