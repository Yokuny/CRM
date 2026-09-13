import { describe, expect, it } from 'vitest';
import { createAppointmentSchema } from './createAppointment.schema.js';

const validId = '507f1f77bcf86cd799439011';

describe('createAppointmentSchema (SCH-30, AD-036)', () => {
  it('accepts the full payload including spaceId and notes', () => {
    const result = createAppointmentSchema.safeParse({
      customerId: validId,
      professionalId: validId,
      date: '2026-09-15',
      time: '09:00',
      spaceId: validId,
      notes: 'Cliente prefere manhã',
    });
    expect(result.success).toBe(true);
  });

  it('accepts only the required fields (spaceId/notes omitted)', () => {
    const result = createAppointmentSchema.safeParse({
      customerId: validId,
      professionalId: validId,
      date: '2026-09-15',
      time: '09:00',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an ISO instant in place of date/time (AD-036: operator input is wall-clock, never an instant)', () => {
    const result = createAppointmentSchema.safeParse({
      customerId: validId,
      professionalId: validId,
      date: '2026-09-15T09:00:00.000Z',
      time: '09:00',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid time format', () => {
    const result = createAppointmentSchema.safeParse({
      customerId: validId,
      professionalId: validId,
      date: '2026-09-15',
      time: '9:00',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid id for customerId/professionalId/spaceId', () => {
    expect(
      createAppointmentSchema.safeParse({
        customerId: 'not-an-id',
        professionalId: validId,
        date: '2026-09-15',
        time: '09:00',
      }).success,
    ).toBe(false);
    expect(
      createAppointmentSchema.safeParse({
        customerId: validId,
        professionalId: 'not-an-id',
        date: '2026-09-15',
        time: '09:00',
      }).success,
    ).toBe(false);
  });

  it('rejects notes longer than 500 characters', () => {
    const result = createAppointmentSchema.safeParse({
      customerId: validId,
      professionalId: validId,
      date: '2026-09-15',
      time: '09:00',
      notes: 'x'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('rejects every tenant-forging key in the body (AD-010, .strict())', () => {
    for (const forged of ['Tenant', 'tenantId', 'orgId']) {
      const result = createAppointmentSchema.safeParse({
        customerId: validId,
        professionalId: validId,
        date: '2026-09-15',
        time: '09:00',
        [forged]: 'forjado',
      });
      expect(result.success, `${forged} deveria ser rejeitado`).toBe(false);
    }
  });
});
