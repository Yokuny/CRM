import { describe, expect, it } from 'vitest';
import {
  addDaysToDisplayDate,
  addMonthsToDisplayDate,
  currentDisplayWeekStart,
  daysInDisplayMonth,
  displayWeekStartOf,
  formatDisplayDate,
  formatDisplayTime,
  isPastInstant,
  startOfDisplayMonth,
  weekdayIndexOfDisplayDate,
} from './displayTime.helper.js';

// design.md/T38 Done-when: "o instante 2026-09-16T00:00:00Z cai na coluna de
// 15/09 às 21:00 — só passa se a formatação usar o fuso de exibição
// (America/Sao_Paulo, UTC-3), não o do executor de testes (a CI roda em
// UTC)." Esta é a asserção que prova isso.
describe('formatDisplayDate/formatDisplayTime (T38, spec.md SCH-29/SCH-35)', () => {
  it('formats 2026-09-16T00:00:00Z as 2026-09-15 at 21:00 in DISPLAY_TIMEZONE (America/Sao_Paulo, UTC-3)', () => {
    const instant = '2026-09-16T00:00:00.000Z';

    expect(formatDisplayDate(instant)).toBe('2026-09-15');
    expect(formatDisplayTime(instant)).toBe('21:00');
  });

  it('accepts a Date object with the same result as the equivalent ISO string', () => {
    const asDate = new Date('2026-09-16T00:00:00.000Z');

    expect(formatDisplayDate(asDate)).toBe('2026-09-15');
    expect(formatDisplayTime(asDate)).toBe('21:00');
  });

  it('formats an instant that stays on the same calendar day in the display timezone', () => {
    // 12:00 UTC = 09:00 em America/Sao_Paulo — mesmo dia civil.
    expect(formatDisplayDate('2026-09-16T12:00:00.000Z')).toBe('2026-09-16');
    expect(formatDisplayTime('2026-09-16T12:00:00.000Z')).toBe('09:00');
  });
});

describe('addDaysToDisplayDate (T38)', () => {
  it('adds days across a month boundary (calendar arithmetic, not instant math)', () => {
    expect(addDaysToDisplayDate('2026-09-28', 7)).toBe('2026-10-05');
  });

  it('subtracts days (negative offset) across a month boundary', () => {
    expect(addDaysToDisplayDate('2026-09-03', -7)).toBe('2026-08-27');
  });

  it('adds exactly one week (7 days) — the week-grid navigation step', () => {
    expect(addDaysToDisplayDate('2026-09-14', 7)).toBe('2026-09-21');
  });
});

describe('weekdayIndexOfDisplayDate (T38)', () => {
  it('returns 0..6 (domingo..sábado, mesma faixa de weeklySchedule/t(WEEKDAY_KEYS[N]))', () => {
    // 2026-09-15 é uma terça-feira.
    expect(weekdayIndexOfDisplayDate('2026-09-15')).toBe(2);
    // 2026-09-14 é uma segunda-feira.
    expect(weekdayIndexOfDisplayDate('2026-09-14')).toBe(1);
    // 2026-09-20 é um domingo.
    expect(weekdayIndexOfDisplayDate('2026-09-20')).toBe(0);
  });
});

describe('currentDisplayWeekStart (T38, spec.md SCH-29)', () => {
  it('returns the Monday of the current week when "now" falls mid-week (display tz)', () => {
    // 2026-09-16T12:00:00Z = 2026-09-16 09:00 em SP (quarta-feira).
    const now = new Date('2026-09-16T12:00:00.000Z');

    expect(currentDisplayWeekStart(now)).toBe('2026-09-14');
  });

  it('returns the Monday of the SAME week when "now" falls on a Sunday (display tz)', () => {
    // 2026-09-20T12:00:00Z = 2026-09-20 09:00 em SP (domingo).
    const now = new Date('2026-09-20T12:00:00.000Z');

    expect(currentDisplayWeekStart(now)).toBe('2026-09-14');
  });

  it('returns the same date when "now" already falls on a Monday (display tz)', () => {
    const now = new Date('2026-09-14T12:00:00.000Z');

    expect(currentDisplayWeekStart(now)).toBe('2026-09-14');
  });
});

describe('displayWeekStartOf (migração dia/semana/mês do calendário)', () => {
  it('returns the Monday of the week that contains an arbitrary mid-week date', () => {
    expect(displayWeekStartOf('2026-09-16')).toBe('2026-09-14');
  });

  it('returns the same Monday when the date already IS a Monday', () => {
    expect(displayWeekStartOf('2026-09-14')).toBe('2026-09-14');
  });

  it('returns the Monday of the same week when the date is a Sunday', () => {
    expect(displayWeekStartOf('2026-09-20')).toBe('2026-09-14');
  });

  it('agrees with currentDisplayWeekStart for "today" (same underlying calculation)', () => {
    const now = new Date('2026-09-16T12:00:00.000Z');
    expect(displayWeekStartOf(formatDisplayDate(now))).toBe(currentDisplayWeekStart(now));
  });
});

describe('startOfDisplayMonth (migração dia/semana/mês do calendário)', () => {
  it('returns the 1st of the month for a mid-month date', () => {
    expect(startOfDisplayMonth('2026-09-16')).toBe('2026-09-01');
  });

  it('returns the same date when already the 1st', () => {
    expect(startOfDisplayMonth('2026-09-01')).toBe('2026-09-01');
  });
});

describe('daysInDisplayMonth (migração dia/semana/mês do calendário)', () => {
  it('returns 30 for September and 31 for October', () => {
    expect(daysInDisplayMonth('2026-09-16')).toBe(30);
    expect(daysInDisplayMonth('2026-10-01')).toBe(31);
  });

  it('returns 28 for February in a non-leap year and 29 in a leap year', () => {
    expect(daysInDisplayMonth('2026-02-10')).toBe(28);
    expect(daysInDisplayMonth('2028-02-10')).toBe(29);
  });
});

describe('addMonthsToDisplayDate (migração dia/semana/mês do calendário)', () => {
  it('adds a month, keeping the same day of month', () => {
    expect(addMonthsToDisplayDate('2026-09-14', 1)).toBe('2026-10-14');
  });

  it('subtracts a month (negative offset)', () => {
    expect(addMonthsToDisplayDate('2026-09-14', -1)).toBe('2026-08-14');
  });

  it('clamps to the last day of the target month when it has fewer days (31/01 + 1 month -> 28/02, never 03/03)', () => {
    expect(addMonthsToDisplayDate('2026-01-31', 1)).toBe('2026-02-28');
  });

  it('crosses a year boundary', () => {
    expect(addMonthsToDisplayDate('2026-12-15', 1)).toBe('2027-01-15');
  });
});

describe('isPastInstant (T38, spec.md SCH-35)', () => {
  it('returns true when the instant is before "now"', () => {
    const start = new Date('2026-09-15T10:00:00.000Z');
    const now = new Date('2026-09-16T00:00:00.000Z');

    expect(isPastInstant(start, now)).toBe(true);
  });

  it('returns false when the instant is after "now" (still upcoming)', () => {
    const start = new Date('2026-09-17T10:00:00.000Z');
    const now = new Date('2026-09-16T00:00:00.000Z');

    expect(isPastInstant(start, now)).toBe(false);
  });

  it('accepts an ISO string for both the instant and defaults "now" to the current time', () => {
    const pastIsoInstant = '2000-01-01T00:00:00.000Z';

    expect(isPastInstant(pastIsoInstant)).toBe(true);
  });
});
