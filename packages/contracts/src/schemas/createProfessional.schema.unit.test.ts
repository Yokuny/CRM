import { describe, expect, it } from 'vitest';
import { createProfessionalSchema } from './createProfessional.schema.js';

const basePayload = {
  name: 'Dra. Ana',
  slotDurationMinutes: 30,
  weeklySchedule: [{ weekday: 1, start: '09:00', end: '12:00' }],
};

describe('createProfessionalSchema (SCH-01, SCH-02, SCH-03)', () => {
  it('accepts a full valid payload with multiple windows on different weekdays', () => {
    const result = createProfessionalSchema.safeParse({
      ...basePayload,
      weeklySchedule: [
        { weekday: 1, start: '09:00', end: '12:00' },
        { weekday: 1, start: '13:00', end: '18:00' },
        { weekday: 2, start: '09:00', end: '12:00' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a window where end <= start', () => {
    const result = createProfessionalSchema.safeParse({
      ...basePayload,
      weeklySchedule: [{ weekday: 1, start: '12:00', end: '12:00' }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'weeklySchedule.0.end')).toBe(true);
    }
  });

  it('rejects weekday outside 0..6', () => {
    const result = createProfessionalSchema.safeParse({
      ...basePayload,
      weeklySchedule: [{ weekday: 7, start: '09:00', end: '10:00' }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'weeklySchedule.0.weekday')).toBe(true);
    }
  });

  it('rejects start/end outside HH:mm format', () => {
    const result = createProfessionalSchema.safeParse({
      ...basePayload,
      weeklySchedule: [{ weekday: 1, start: '9:00', end: '25:00' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects two overlapping windows on the same weekday (SCH-03)', () => {
    const result = createProfessionalSchema.safeParse({
      ...basePayload,
      weeklySchedule: [
        { weekday: 1, start: '09:00', end: '12:00' },
        { weekday: 1, start: '11:00', end: '14:00' },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message === 'janelas sobrepostas no mesmo weekday')).toBe(true);
    }
  });

  it('accepts adjacent windows on the same weekday (end 12:00 / start 12:00)', () => {
    const result = createProfessionalSchema.safeParse({
      ...basePayload,
      weeklySchedule: [
        { weekday: 1, start: '09:00', end: '12:00' },
        { weekday: 1, start: '12:00', end: '18:00' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects slotDurationMinutes outside 5..480', () => {
    expect(createProfessionalSchema.safeParse({ ...basePayload, slotDurationMinutes: 4 }).success).toBe(false);
    expect(createProfessionalSchema.safeParse({ ...basePayload, slotDurationMinutes: 481 }).success).toBe(false);
  });

  it('rejects a non-integer slotDurationMinutes', () => {
    const result = createProfessionalSchema.safeParse({ ...basePayload, slotDurationMinutes: 30.5 });
    expect(result.success).toBe(false);
  });

  it('rejects an empty or whitespace-only name', () => {
    expect(createProfessionalSchema.safeParse({ ...basePayload, name: '' }).success).toBe(false);
    expect(createProfessionalSchema.safeParse({ ...basePayload, name: '   ' }).success).toBe(false);
  });

  it('rejects every tenant-forging key in the body (AD-010, .strict())', () => {
    for (const forged of ['Tenant', 'tenantId', 'orgId']) {
      const result = createProfessionalSchema.safeParse({ ...basePayload, [forged]: 'forjado' });
      expect(result.success, `${forged} deveria ser rejeitado`).toBe(false);
    }
  });
});
