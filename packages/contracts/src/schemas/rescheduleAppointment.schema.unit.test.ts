import { describe, expect, it } from 'vitest';
import { rescheduleAppointmentSchema } from './rescheduleAppointment.schema.js';

const validId = '507f1f77bcf86cd799439011';

describe('rescheduleAppointmentSchema (SCH-31, AD-036)', () => {
  it('accepts date+time without professionalId', () => {
    const result = rescheduleAppointmentSchema.safeParse({ date: '2026-09-16', time: '10:00' });
    expect(result.success).toBe(true);
  });

  it('accepts date+time+professionalId', () => {
    const result = rescheduleAppointmentSchema.safeParse({
      date: '2026-09-16',
      time: '10:00',
      professionalId: validId,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an ISO instant in place of date/time', () => {
    const result = rescheduleAppointmentSchema.safeParse({ date: '2026-09-16T10:00:00.000Z', time: '10:00' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing date or time', () => {
    expect(rescheduleAppointmentSchema.safeParse({ time: '10:00' }).success).toBe(false);
    expect(rescheduleAppointmentSchema.safeParse({ date: '2026-09-16' }).success).toBe(false);
  });

  it('rejects an invalid professionalId', () => {
    const result = rescheduleAppointmentSchema.safeParse({
      date: '2026-09-16',
      time: '10:00',
      professionalId: 'not-an-id',
    });
    expect(result.success).toBe(false);
  });

  it('rejects every tenant-forging key in the body (AD-010, .strict())', () => {
    for (const forged of ['Tenant', 'tenantId', 'orgId']) {
      const result = rescheduleAppointmentSchema.safeParse({ date: '2026-09-16', time: '10:00', [forged]: 'forjado' });
      expect(result.success, `${forged} deveria ser rejeitado`).toBe(false);
    }
  });
});
