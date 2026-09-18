import { DISPLAY_TIMEZONE } from '@crm/contracts';

// AD-036/design.md Risk: "operador com o navegador em outro fuso veria
// horários diferentes dos que a IA manda, e a CI roda em UTC" — este arquivo
// existe só para não repetir esse bug. `formatDate.helper.ts` (irmão) usa
// date-fns no fuso LOCAL do navegador (certo pra tudo que já é wall-clock,
// ex. campos de formulário); aqui é o oposto: todo instante (Date/ISO em
// UTC) é formatado no fuso de EXIBIÇÃO fixo (`DISPLAY_TIMEZONE`,
// packages/contracts), o mesmo fuso que o back-end usa pra gerar
// `dateInDisplayTz`/`timeInDisplayTz` (packages/db) — nunca `date-fns`, nunca
// o fuso do `Intl` default do runtime.
const toDate = (value: Date | string): Date => (value instanceof Date ? value : new Date(value));

// `en-CA` formata `{year, month, day}` como `YYYY-MM-DD` nativamente — sem
// isso seria preciso remontar a string a partir de `formatToParts`.
const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: DISPLAY_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: DISPLAY_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** Formata um instante UTC (Date ou ISO string) como `YYYY-MM-DD` no fuso de exibição (`DISPLAY_TIMEZONE`). */
export const formatDisplayDate = (value: Date | string): string => dateFormatter.format(toDate(value));

/** Formata um instante UTC (Date ou ISO string) como `HH:mm` no fuso de exibição (`DISPLAY_TIMEZONE`). */
export const formatDisplayTime = (value: Date | string): string => timeFormatter.format(toDate(value));

// Aritmética de CALENDÁRIO pura sobre uma data de parede (`YYYY-MM-DD`) —
// nunca sobre um instante: soma/subtrai dias nos componentes Y/M/D via um
// Date.UTC usado só como calculadora (não representa nenhum instante real),
// o mesmo raciocínio de `wallClockToUtc`/`dateInDisplayTz` do back-end
// (packages/db) mantendo a conversão de fuso isolada nos formatters acima.
export const addDaysToDisplayDate = (date: string, days: number): string => {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};

// Dia da semana (0=domingo..6=sábado, mesma faixa de `weeklySchedule`/
// `t(WEEKDAY_KEYS[N])`) de uma data de parede — cálculo de calendário puro
// (o dia da semana de uma data não depende de fuso horário nenhum).
export const weekdayIndexOfDisplayDate = (date: string): number => {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
};

// Segunda-feira (convenção deste projeto pro início da semana, SCH-29) da
// semana que contém uma data de parede qualquer — mesma aritmética de
// calendário pura de addDaysToDisplayDate, generalizada pra qualquer `date`
// (não só "hoje"), usada pelas visões de dia/semana/mês do calendário.
export const displayWeekStartOf = (date: string): string => {
  const offsetFromMonday = (weekdayIndexOfDisplayDate(date) + 6) % 7; // domingo(0)->6 ... segunda(1)->0
  return addDaysToDisplayDate(date, -offsetFromMonday);
};

// Segunda-feira da semana corrente, calculada a partir de "hoje" NO FUSO DE
// EXIBIÇÃO — nunca no fuso do navegador/CI.
export const currentDisplayWeekStart = (now: Date = new Date()): string => displayWeekStartOf(formatDisplayDate(now));

// Dia 1 do mês que contém uma data de parede — aritmética de calendário pura
// (mesmo raciocínio de addDaysToDisplayDate).
export const startOfDisplayMonth = (date: string): string => {
  const [year, month] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10);
};

// Quantos dias tem o mês que contém `date` (dia 0 do mês seguinte = último
// dia do mês atual, truque padrão de Date.UTC) — usado pra montar a grade da
// visão de mês.
export const daysInDisplayMonth = (date: string): number => {
  const [year, month] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
};

// Soma/subtrai meses a uma data de parede, preservando o dia quando possível
// e "encaixando" (clamp) pro último dia do mês de destino quando ele não
// existir (ex.: 31/01 + 1 mês -> 28/02, nunca 03/03 por overflow de
// Date.UTC) — mesma semântica de addMonths do date-fns, implementada sem a
// dependência (este arquivo nunca usa date-fns, ver cabeçalho).
export const addMonthsToDisplayDate = (date: string, months: number): string => {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const targetIndex = month - 1 + months;
  const daysInTargetMonth = new Date(Date.UTC(year, targetIndex + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, targetIndex, Math.min(day, daysInTargetMonth))).toISOString().slice(0, 10);
};

// SCH-35: "o horário passou sem nenhuma marcação" — comparação de INSTANTE
// (timestamp), não de fuso: independe de `DISPLAY_TIMEZONE` por construção,
// mas mora aqui porque todo consumidor (week-grid.tsx) já formata o mesmo
// instante com as funções acima.
export const isPastInstant = (value: Date | string, now: Date = new Date()): boolean =>
  toDate(value).getTime() < now.getTime();
