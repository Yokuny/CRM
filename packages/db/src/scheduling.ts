import { DISPLAY_TIMEZONE } from '@crm/contracts';

// Módulo puro (sem Mongoose) de matemática de grade/slots/fuso — AD-035/AD-036.
// Reescrito a partir de computeFreeSlots/isSlotAligned de
// ../DentalEase/DentalEase-BackEnd/src/helpers/slots.helper.ts: grade por
// profissional (com N janelas), sem a dimensão restritiva de sala, e sem
// offset de fuso cravado (a referência usa BR_OFFSET = '-03:00' fixo).

export const MAX_HORIZON_DAYS = 90;
export const MIN_LEAD_MINUTES = 60;
export const DEFAULT_MAX_SLOTS = 16;

export interface ScheduleWindow {
  weekday: number; // 0..6, 0 = domingo
  start: string; // 'HH:mm', hora de parede
  end: string; // 'HH:mm', hora de parede
}

export interface FreeSlot {
  start: Date;
  time: string;
  professionals: Array<{ id: string; name: string }>;
}

interface ProfessionalGrid {
  weeklySchedule: ScheduleWindow[];
  slotDurationMinutes: number;
}

interface FreeSlotProfessional extends ProfessionalGrid {
  id: string;
  name: string;
}

interface BusyInterval {
  professionalId: string;
  start: Date;
  end: Date;
}

interface ComputeFreeSlotsInput {
  professionals: FreeSlotProfessional[];
  busy: BusyInterval[];
  date: string; // 'YYYY-MM-DD'
  now: Date;
  maxSlots?: number;
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Resolve o offset (em minutos, positivo a leste de UTC) em vigor num
// instante, para um fuso nomeado — nunca uma string fixa como '-03:00', que
// quebra se o horário de verão brasileiro voltar (AD-036).
const getOffsetMinutes = (instant: Date, timeZone: string): number => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const label = formatter.formatToParts(instant).find((part) => part.type === 'timeZoneName')?.value ?? 'GMT+00:00';
  const match = label.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!match) return 0;
  const sign = match[1] === '-' ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
};

// Hora de parede -> instante UTC, sem offset cravado: duas passadas de
// Intl.DateTimeFormat (verificado por execução no Design — ver
// Research Provenance de design.md). A primeira passada estima o offset a
// partir de uma leitura ingênua (a hora de parede interpretada como se já
// fosse UTC); a segunda re-resolve o offset no instante candidato, que é o
// que efetivamente vale para a data alvo.
export const wallClockToUtc = (date: string, time: string, timeZone: string = DISPLAY_TIMEZONE): Date => {
  const naiveUtcMs = Date.parse(`${date}T${time}:00.000Z`);
  const firstPassOffset = getOffsetMinutes(new Date(naiveUtcMs), timeZone);
  const candidateMs = naiveUtcMs - firstPassOffset * 60_000;
  const secondPassOffset = getOffsetMinutes(new Date(candidateMs), timeZone);
  return new Date(naiveUtcMs - secondPassOffset * 60_000);
};

export const dateInDisplayTz = (instant: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: DISPLAY_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);

export const timeInDisplayTz = (instant: Date): string =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: DISPLAY_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant);

export const weekdayInDisplayTz = (date: string): number => {
  // Meio-dia evita qualquer ambiguidade de borda de dia na conversão.
  const instant = wallClockToUtc(date, '12:00', DISPLAY_TIMEZONE);
  const label = new Intl.DateTimeFormat('en-US', { timeZone: DISPLAY_TIMEZONE, weekday: 'short' }).format(instant);
  return WEEKDAY_INDEX[label] ?? 0;
};

// Só slots que cabem INTEIROS na janela (Edge Case do spec.md): um slot que
// ultrapassaria o `end` da janela nunca é gerado.
export const expandWindowsToSlots = (
  windows: ScheduleWindow[],
  slotDurationMinutes: number,
  date: string,
): Array<{ start: Date; end: Date }> => {
  const weekday = weekdayInDisplayTz(date);
  const durationMs = slotDurationMinutes * 60_000;
  const slots: Array<{ start: Date; end: Date }> = [];

  for (const window of windows) {
    if (window.weekday !== weekday) continue;

    const windowStartMs = wallClockToUtc(date, window.start).getTime();
    const windowEndMs = wallClockToUtc(date, window.end).getTime();

    for (let cursor = windowStartMs; cursor + durationMs <= windowEndMs; cursor += durationMs) {
      slots.push({ start: new Date(cursor), end: new Date(cursor + durationMs) });
    }
  }

  return slots;
};

export const overlaps = (a: { start: Date; end: Date }, b: { start: Date; end: Date }): boolean =>
  a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();

// Grade por profissional, N janelas, sem sala restritiva (Space é
// informativo — spec.md Assumptions). Ocupação (`busy`) é por profissional:
// um intervalo ocupado de um profissional nunca remove o slot de outro.
export const computeFreeSlots = ({ professionals, busy, date, now, maxSlots = DEFAULT_MAX_SLOTS }: ComputeFreeSlotsInput): FreeSlot[] => {
  const nowMs = now.getTime();
  const leadMs = MIN_LEAD_MINUTES * 60_000;

  const busyByProfessional = new Map<string, BusyInterval[]>();
  for (const interval of busy) {
    const list = busyByProfessional.get(interval.professionalId);
    if (list) {
      list.push(interval);
    } else {
      busyByProfessional.set(interval.professionalId, [interval]);
    }
  }

  const slotsByStart = new Map<number, { start: Date; professionals: Array<{ id: string; name: string }> }>();

  for (const professional of professionals) {
    const professionalBusy = busyByProfessional.get(professional.id) ?? [];
    const slots = expandWindowsToSlots(professional.weeklySchedule, professional.slotDurationMinutes, date);

    for (const slot of slots) {
      if (slot.start.getTime() - nowMs < leadMs) continue;
      if (professionalBusy.some((interval) => overlaps(slot, interval))) continue;

      const key = slot.start.getTime();
      const entry = slotsByStart.get(key);
      if (entry) {
        entry.professionals.push({ id: professional.id, name: professional.name });
      } else {
        slotsByStart.set(key, { start: slot.start, professionals: [{ id: professional.id, name: professional.name }] });
      }
    }
  }

  return Array.from(slotsByStart.values())
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .slice(0, maxSlots)
    .map((entry) => ({ start: entry.start, time: timeInDisplayTz(entry.start), professionals: entry.professionals }));
};

export const isSlotAligned = (start: Date, professional: ProfessionalGrid): boolean => {
  const date = dateInDisplayTz(start);
  const slots = expandWindowsToSlots(professional.weeklySchedule, professional.slotDurationMinutes, date);
  return slots.some((slot) => slot.start.getTime() === start.getTime());
};
