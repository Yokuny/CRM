import { describe, expect, it } from 'vitest';
import { updateProfessionalSchema } from './updateProfessional.schema.js';

describe('updateProfessionalSchema (SCH-01, SCH-02, SCH-03, SCH-05)', () => {
  it('accepts an empty partial payload', () => {
    expect(updateProfessionalSchema.safeParse({}).success).toBe(true);
  });

  it('accepts only active (pause a professional without touching the rest)', () => {
    const result = updateProfessionalSchema.safeParse({ active: false });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ active: false });
  });

  it('applies the same window rules when weeklySchedule is present', () => {
    const overlapping = updateProfessionalSchema.safeParse({
      weeklySchedule: [
        { weekday: 3, start: '08:00', end: '12:00' },
        { weekday: 3, start: '11:00', end: '13:00' },
      ],
    });
    expect(overlapping.success).toBe(false);
  });

  it('rejects slotDurationMinutes outside 5..480 when present', () => {
    expect(updateProfessionalSchema.safeParse({ slotDurationMinutes: 0 }).success).toBe(false);
    expect(updateProfessionalSchema.safeParse({ slotDurationMinutes: 481 }).success).toBe(false);
    expect(updateProfessionalSchema.safeParse({ slotDurationMinutes: 60 }).success).toBe(true);
  });

  it('rejects an empty name when present', () => {
    expect(updateProfessionalSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('rejects every tenant-forging key in the body (AD-010, .strict())', () => {
    for (const forged of ['Tenant', 'tenantId', 'orgId']) {
      const result = updateProfessionalSchema.safeParse({ [forged]: 'forjado' });
      expect(result.success, `${forged} deveria ser rejeitado`).toBe(false);
    }
  });
});
