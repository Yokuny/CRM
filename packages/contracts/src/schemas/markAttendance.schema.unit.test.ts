import { describe, expect, it } from 'vitest';
import { markAttendanceSchema } from './markAttendance.schema.js';

describe('markAttendanceSchema (SCH-34)', () => {
  it('accepts "completed"', () => {
    expect(markAttendanceSchema.safeParse({ status: 'completed' }).success).toBe(true);
  });

  it('accepts "no_show"', () => {
    expect(markAttendanceSchema.safeParse({ status: 'no_show' }).success).toBe(true);
  });

  it('rejects any other status value', () => {
    expect(markAttendanceSchema.safeParse({ status: 'confirmed' }).success).toBe(false);
    expect(markAttendanceSchema.safeParse({ status: 'pending' }).success).toBe(false);
  });

  it('rejects a missing status', () => {
    expect(markAttendanceSchema.safeParse({}).success).toBe(false);
  });

  it('rejects every tenant-forging key in the body (AD-010, .strict())', () => {
    for (const forged of ['Tenant', 'tenantId', 'orgId']) {
      const result = markAttendanceSchema.safeParse({ status: 'completed', [forged]: 'forjado' });
      expect(result.success, `${forged} deveria ser rejeitado`).toBe(false);
    }
  });
});
