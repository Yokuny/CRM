import { describe, expect, it } from 'vitest';
import { cancelAppointmentSchema } from './cancelAppointment.schema.js';

describe('cancelAppointmentSchema (SCH-32)', () => {
  it('accepts an empty payload (reason omitted)', () => {
    expect(cancelAppointmentSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a reason', () => {
    const result = cancelAppointmentSchema.safeParse({ reason: 'Cliente remarcou por telefone' });
    expect(result.success).toBe(true);
  });

  it('rejects a reason longer than 500 characters', () => {
    const result = cancelAppointmentSchema.safeParse({ reason: 'x'.repeat(501) });
    expect(result.success).toBe(false);
  });

  it('rejects every tenant-forging key in the body (AD-010, .strict())', () => {
    for (const forged of ['Tenant', 'tenantId', 'orgId']) {
      const result = cancelAppointmentSchema.safeParse({ [forged]: 'forjado' });
      expect(result.success, `${forged} deveria ser rejeitado`).toBe(false);
    }
  });
});
