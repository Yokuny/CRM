import { formatDistanceToNow as dateFnsFormatDistanceToNow, format, type Locale } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatDisplayDate, formatDisplayTime } from './displayTime.helper.js';
import { DEFAULT_LANGUAGE, type Language } from './translate.helper.js';

// Único ponto do app que importa date-fns: toda data/hora EXIBIDA na tela
// passa por aqui, no formato do idioma do usuário. Os formatos "de dado"
// (`YYYY-MM-DD`/`HH:mm` de search param, valor de <input>, chave de grade)
// continuam em displayTime.helper.ts e nunca vão direto pra tela.

type DateFormats = { locale: Locale; date: string; time: string; dateTime: string };

// Padrões por idioma, em tokens LOCALIZADOS do date-fns (`PP`/`p`): a ordem
// e a pontuação vêm do próprio locale. pt-BR: "1 jun 2026", "14:05".
const DATE_FORMATS: Record<Language, DateFormats> = {
  'pt-BR': { locale: ptBR, date: 'PP', time: 'p', dateTime: "PP '·' p" },
};

export type DateInput = Date | string | number;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const toInstant = (value: DateInput): Date | null => {
  const instant = value instanceof Date ? value : new Date(value);
  return Number.isNaN(instant.getTime()) ? null : instant;
};

// O `format` do date-fns sempre lê os componentes LOCAIS do Date — então a
// entrada vira um Date "de parede" (componentes locais = o que deve aparecer
// na tela), independente do fuso do navegador:
// - `YYYY-MM-DD` é data de parede, sem fuso: montada direto, nunca via
//   `new Date('2026-06-01')` (meia-noite UTC = 31/05 em fuso negativo).
// - qualquer outra entrada (Date, timestamp, ISO com hora) é um instante:
//   vai pro fuso de exibição (DISPLAY_TIMEZONE, AD-036), nunca o do navegador.
const toWallClock = (value: DateInput): Date | null => {
  if (typeof value === 'string' && DATE_ONLY.test(value)) {
    const [year, month, day] = value.split('-').map(Number) as [number, number, number];
    return new Date(year, month - 1, day);
  }
  const instant = toInstant(value);
  if (!instant) return null;
  const [year, month, day] = formatDisplayDate(instant).split('-').map(Number) as [number, number, number];
  const [hours, minutes] = formatDisplayTime(instant).split(':').map(Number) as [number, number];
  return new Date(year, month - 1, day, hours, minutes);
};

const formatAs = (value: DateInput, pattern: 'date' | 'time' | 'dateTime', language: Language): string => {
  const wallClock = toWallClock(value);
  if (!wallClock) return '';
  const formats = DATE_FORMATS[language];
  return format(wallClock, formats[pattern], { locale: formats.locale });
};

/**
 * Data no padrão do idioma. Entrada inválida vira `''`.
 *
 * @example
 * formatDate('2026-06-01') // "1 jun 2026"
 * formatDate('2026-06-01T15:00:00.000Z') // "1 jun 2026" (fuso de exibição)
 */
export const formatDate = (value: DateInput, language: Language = DEFAULT_LANGUAGE): string =>
  formatAs(value, 'date', language);

/**
 * Hora no padrão do idioma, no fuso de exibição.
 *
 * @example
 * formatTime('2026-06-01T15:00:00.000Z') // "12:00"
 */
export const formatTime = (value: DateInput, language: Language = DEFAULT_LANGUAGE): string =>
  formatAs(value, 'time', language);

/**
 * Data + hora no padrão do idioma, no fuso de exibição.
 *
 * @example
 * formatDateTime('2026-06-01T15:00:00.000Z') // "1 jun 2026 · 12:00"
 */
export const formatDateTime = (value: DateInput, language: Language = DEFAULT_LANGUAGE): string =>
  formatAs(value, 'dateTime', language);

/**
 * Distância relativa até agora, com sufixo. Comparação de instantes —
 * independe de fuso.
 *
 * @example
 * formatDistanceToNow(threeDaysAgo) // "há 3 dias"
 */
export const formatDistanceToNow = (value: DateInput, language: Language = DEFAULT_LANGUAGE): string => {
  const instant = toInstant(value);
  return instant ? dateFnsFormatDistanceToNow(instant, { locale: DATE_FORMATS[language].locale, addSuffix: true }) : '';
};

// Locale do date-fns do idioma, pra componentes que formatam datas por conta
// própria (o <Calendar> do react-day-picker: mês, dias da semana) — assim
// nenhum outro arquivo importa `date-fns/locale`.
export const getDateLocale = (language: Language = DEFAULT_LANGUAGE): Locale => DATE_FORMATS[language].locale;
