import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatDate, formatDateTime, formatDistanceToNow, formatTime, getDateLocale } from './formatDate.helper.js';

describe('formatDate', () => {
  it('formats a wall-clock date (YYYY-MM-DD) as "PP" in pt-BR, with no timezone shift', () => {
    expect(formatDate('2026-06-01')).toBe('1 jun 2026');
    expect(formatDate('2026-09-18')).toBe('18 set 2026');
  });

  it('formats an instant on its calendar day in DISPLAY_TIMEZONE (America/Sao_Paulo, UTC-3), not the runner timezone', () => {
    // 02:00 UTC de 01/06 = 23:00 de 31/05 em America/Sao_Paulo.
    expect(formatDate('2026-06-01T02:00:00.000Z')).toBe('31 mai 2026');
    expect(formatDate(new Date('2026-06-01T02:00:00.000Z'))).toBe('31 mai 2026');
    expect(formatDate(Date.parse('2026-06-01T15:00:00.000Z'))).toBe('1 jun 2026');
  });

  it('returns an empty string for an invalid input', () => {
    expect(formatDate('not-a-date')).toBe('');
    expect(formatDate(new Date(Number.NaN))).toBe('');
  });
});

describe('formatTime/formatDateTime', () => {
  it('formats an instant in DISPLAY_TIMEZONE', () => {
    expect(formatTime('2026-09-16T00:00:00.000Z')).toBe('21:00');
    expect(formatDateTime('2026-09-16T00:00:00.000Z')).toBe('15 set 2026 · 21:00');
  });

  it('keeps midnight as 00:00 on the same day', () => {
    // 03:00 UTC = 00:00 em America/Sao_Paulo.
    expect(formatDateTime('2026-06-01T03:00:00.000Z')).toBe('1 jun 2026 · 00:00');
  });
});

describe('formatDistanceToNow', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats the relative distance in pt-BR with a suffix', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-18T12:00:00.000Z'));

    expect(formatDistanceToNow('2026-09-15T12:00:00.000Z')).toBe('há 3 dias');
  });

  it('returns an empty string for an invalid input', () => {
    expect(formatDistanceToNow('not-a-date')).toBe('');
  });
});

describe('getDateLocale', () => {
  it('returns the date-fns locale of the language (pt-BR by default)', () => {
    expect(getDateLocale().code).toBe('pt-BR');
  });
});
