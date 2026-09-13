import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  computeFreeSlots,
  DEFAULT_MAX_SLOTS,
  expandWindowsToSlots,
  isSlotAligned,
  MAX_HORIZON_DAYS,
  MIN_LEAD_MINUTES,
  overlaps,
  timeInDisplayTz,
  wallClockToUtc,
} from './scheduling.js';

// 2026-09-15 é uma terça-feira (weekday 2) em America/Sao_Paulo — usado como
// data-base em todo o arquivo.
const TUESDAY = '2026-09-15';
const TUESDAY_WEEKDAY = 2;

describe('scheduling.ts — constantes', () => {
  it('exporta os tetos de horizonte, antecedência e slots por resposta do spec.md Assumptions', () => {
    expect(MAX_HORIZON_DAYS).toBe(90);
    expect(MIN_LEAD_MINUTES).toBe(60);
    expect(DEFAULT_MAX_SLOTS).toBe(16);
  });
});

describe('wallClockToUtc — AD-036 (offset resolvido por Intl, nunca cravado)', () => {
  it('converte 2026-09-15 21:00 (America/Sao_Paulo, default) virando o dia em UTC', () => {
    const instant = wallClockToUtc(TUESDAY, '21:00');

    expect(instant.toISOString()).toBe('2026-09-16T00:00:00.000Z');
  });

  it('timeInDisplayTz do instante resultante volta a 21:00', () => {
    const instant = wallClockToUtc(TUESDAY, '21:00');

    expect(timeInDisplayTz(instant)).toBe('21:00');
  });

  it('não crava -03:00: um fuso explícito != America/Sao_Paulo (Manaus, UTC-4) resolve seu próprio offset', () => {
    const instant = wallClockToUtc(TUESDAY, '08:00', 'America/Manaus');

    expect(instant.toISOString()).toBe('2026-09-15T12:00:00.000Z');
  });
});

describe('expandWindowsToSlots', () => {
  it('gera slots das duas janelas do mesmo weekday e nenhum no intervalo entre elas', () => {
    const windows = [
      { weekday: TUESDAY_WEEKDAY, start: '09:00', end: '10:00' },
      { weekday: TUESDAY_WEEKDAY, start: '14:00', end: '15:00' },
    ];

    const slots = expandWindowsToSlots(windows, 30, TUESDAY);
    const starts = slots.map((slot) => timeInDisplayTz(slot.start));

    expect(starts).toEqual(['09:00', '09:30', '14:00', '14:30']);
    // Nada no intervalo 10:00–14:00 (o gap entre as duas janelas).
    expect(starts).not.toContain('10:00');
    expect(starts).not.toContain('13:30');
  });

  it('nunca gera um slot que não cabe inteiro dentro da janela (Edge Case do spec.md)', () => {
    const windows = [{ weekday: TUESDAY_WEEKDAY, start: '09:00', end: '10:00' }];

    // 40 min: 09:00–09:40 cabe; um próximo em 09:40 terminaria às 10:20,
    // além do fim da janela — não deve ser gerado.
    const slots = expandWindowsToSlots(windows, 40, TUESDAY);

    expect(slots).toHaveLength(1);
    expect(timeInDisplayTz(slots[0].start)).toBe('09:00');
  });

  it('não gera nenhum slot num weekday sem nenhuma janela', () => {
    const windows = [{ weekday: (TUESDAY_WEEKDAY + 1) % 7, start: '09:00', end: '10:00' }];

    const slots = expandWindowsToSlots(windows, 30, TUESDAY);

    expect(slots).toEqual([]);
  });
});

describe('computeFreeSlots', () => {
  const windows = [{ weekday: TUESDAY_WEEKDAY, start: '09:00', end: '11:00' }];
  // now = bem antes das janelas, então a antecedência mínima só descarta o
  // que os testes pedirem explicitamente.
  const farPastNow = new Date('2026-01-01T00:00:00.000Z');

  it('descarta início a menos de MIN_LEAD_MINUTES de `now`, mas mantém o resto', () => {
    // now cravado exatamente no início da janela (09:00).
    const now = wallClockToUtc(TUESDAY, '09:00');

    const slots = computeFreeSlots({
      professionals: [{ id: 'p1', name: 'Ana', weeklySchedule: windows, slotDurationMinutes: 30 }],
      busy: [],
      date: TUESDAY,
      now,
      maxSlots: DEFAULT_MAX_SLOTS,
    });

    const starts = slots.map((slot) => timeInDisplayTz(slot.start));
    // 09:00 (0min de `now`) e 09:30 (30min de `now`) estão a menos de 60min — descartados.
    expect(starts).not.toContain('09:00');
    expect(starts).not.toContain('09:30');
    // 10:00 está a exatos 60min de `now` (regra é "< 60min" descarta, então 60 fica) — mantido.
    expect(starts).toContain('10:00');
    expect(starts).toContain('10:30');
  });

  it('respeita o teto `maxSlots`', () => {
    const slots = computeFreeSlots({
      professionals: [{ id: 'p1', name: 'Ana', weeklySchedule: windows, slotDurationMinutes: 30 }],
      busy: [],
      date: TUESDAY,
      now: farPastNow,
      maxSlots: 2,
    });

    // Janela 09:00–11:00 de 30min produz 4 slots; o teto corta para 2.
    expect(slots).toHaveLength(2);
  });

  it('lista por slot só os profissionais livres naquele horário', () => {
    const slots = computeFreeSlots({
      professionals: [
        { id: 'p1', name: 'Ana', weeklySchedule: windows, slotDurationMinutes: 60 },
        { id: 'p2', name: 'Bia', weeklySchedule: windows, slotDurationMinutes: 60 },
      ],
      busy: [],
      date: TUESDAY,
      now: farPastNow,
      maxSlots: DEFAULT_MAX_SLOTS,
    });

    const nineOClock = slots.find((slot) => timeInDisplayTz(slot.start) === '09:00');
    expect(nineOClock?.professionals).toEqual(
      expect.arrayContaining([
        { id: 'p1', name: 'Ana' },
        { id: 'p2', name: 'Bia' },
      ]),
    );
    expect(nineOClock?.professionals).toHaveLength(2);
  });

  it('um intervalo ocupado remove o slot só do profissional ocupado, não dos outros livres no mesmo horário', () => {
    const nineOClock = wallClockToUtc(TUESDAY, '09:00');
    const tenOClock = wallClockToUtc(TUESDAY, '10:00');

    const slots = computeFreeSlots({
      professionals: [
        { id: 'p1', name: 'Ana', weeklySchedule: windows, slotDurationMinutes: 60 },
        { id: 'p2', name: 'Bia', weeklySchedule: windows, slotDurationMinutes: 60 },
      ],
      busy: [{ professionalId: 'p1', start: nineOClock, end: tenOClock }],
      date: TUESDAY,
      now: farPastNow,
      maxSlots: DEFAULT_MAX_SLOTS,
    });

    const nineOClockSlot = slots.find((slot) => timeInDisplayTz(slot.start) === '09:00');
    // O slot continua existindo (Bia está livre) mas sem a Ana na lista.
    expect(nineOClockSlot?.professionals).toEqual([{ id: 'p2', name: 'Bia' }]);
  });
});

describe('isSlotAligned', () => {
  const professional = {
    weeklySchedule: [{ weekday: TUESDAY_WEEKDAY, start: '09:00', end: '10:00' }],
    slotDurationMinutes: 30,
  };

  it('aceita um início exatamente no grid da janela', () => {
    expect(isSlotAligned(wallClockToUtc(TUESDAY, '09:30'), professional)).toBe(true);
  });

  it('rejeita um início fora do grid (não múltiplo da duração do slot)', () => {
    expect(isSlotAligned(wallClockToUtc(TUESDAY, '09:15'), professional)).toBe(false);
  });

  it('rejeita um início fora de qualquer janela', () => {
    expect(isSlotAligned(wallClockToUtc(TUESDAY, '11:00'), professional)).toBe(false);
  });

  it('rejeita um início num weekday sem nenhuma janela', () => {
    const wednesday = '2026-09-16';
    expect(isSlotAligned(wallClockToUtc(wednesday, '09:00'), professional)).toBe(false);
  });
});

describe('overlaps', () => {
  it('detecta interseção real entre dois intervalos', () => {
    const a = { start: new Date('2026-09-15T09:00:00.000Z'), end: new Date('2026-09-15T10:00:00.000Z') };
    const b = { start: new Date('2026-09-15T09:30:00.000Z'), end: new Date('2026-09-15T10:30:00.000Z') };

    expect(overlaps(a, b)).toBe(true);
  });

  it('intervalos que só se tocam na borda não se sobrepõem', () => {
    const a = { start: new Date('2026-09-15T09:00:00.000Z'), end: new Date('2026-09-15T10:00:00.000Z') };
    const b = { start: new Date('2026-09-15T10:00:00.000Z'), end: new Date('2026-09-15T11:00:00.000Z') };

    expect(overlaps(a, b)).toBe(false);
  });
});

describe('scheduling.ts — estrutural (isomórfico, sem Mongoose)', () => {
  it('não importa mongoose', () => {
    const source = readFileSync(fileURLToPath(new URL('./scheduling.ts', import.meta.url)), 'utf-8');

    expect(source).not.toMatch(/from ['"]mongoose['"]/);
  });
});
