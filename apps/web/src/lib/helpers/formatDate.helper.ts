import {
  formatDistanceToNow as dateFnsFormatDistanceToNow,
  type FormatDistanceToNowOptions,
  type FormatOptions,
  format,
  isValid,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

const numClean = (value: string | number) => String(value).replace(/[^0-9]/g, '');

/**
 * Masks a string as a date (dd/mm/yyyy).
 *
 * @param value - The raw string input
 * @returns The masked string
 */
export const maskDate = (value: string | undefined | null) => {
  if (!value) return '';
  const num = numClean(value);
  return num
    .replace(/\D/g, '')
    .replace(/(\d{2})(\d)/, '$1/$2')
    .replace(/(\d{2})\/(\d{2})(\d)/, '$1/$2/$3')
    .slice(0, 10);
};

/**
 * Formats a date using ptBR locale.
 *
 * @param date - The date to format (Date object, timestamp, or ISO string)
 * @param formatStr - The format pattern (default: 'dd MMM yyyy')
 * @param fallback - String to return if the date is invalid (default: '')
 * @param options - Optional date-fns format options (e.g. weekStartsOn)
 * @returns The formatted date string, or the fallback string if the date is invalid.
 *
 * @example
 * formatDate(new Date()) // "01 jan 2026"
 * formatDate(new Date(), 'PP') // "1 de jan. de 2026"
 * formatDate(null, 'dd MMM yyyy', '-') // "-"
 */
export function formatDate(
  date: Date | string | number | null | undefined,
  formatStr = 'dd MMM yyyy',
  fallback = '',
  options?: FormatOptions,
): string {
  if (!date) return fallback;

  const d = new Date(date);
  if (!isValid(d)) {
    return fallback;
  }

  return format(d, formatStr, {
    locale: ptBR,
    ...options,
  });
}

/**
 * Formats the distance to now using ptBR locale.
 *
 * @param date - The date to compare with now
 * @param options - Optional date-fns formatDistanceToNow options
 * @returns The localized distance string
 */
export function formatDistanceToNow(date: Date | string | number, options?: FormatDistanceToNowOptions): string {
  const d = new Date(date);
  if (!isValid(d)) return '';

  return dateFnsFormatDistanceToNow(d, {
    locale: ptBR,
    ...options,
  });
}

/**
 * Gets a list of localized month names.
 *
 * @param formatStr - The format pattern (default: 'MMM')
 * @returns Array of localized month names
 */
export function getLocalizedMonths(formatStr = 'MMM'): string[] {
  return Array.from({ length: 12 }, (_, i) => formatDate(new Date(2020, i, 1), formatStr));
}
