import { formatDisplayDate, formatDisplayTime } from '@/lib/helpers/displayTime.helper.js';
import type { AppointmentRecord } from '@/query/appointment.js';

export const HOUR_HEIGHT_PX = 48;
export const HOURS_IN_DAY = 24;
const MINUTES_IN_DAY = HOURS_IN_DAY * 60;
const COLUMN_HEIGHT_PX = HOURS_IN_DAY * HOUR_HEIGHT_PX;
const MIN_ITEM_HEIGHT_PX = 20;

export type PositionedItem = {
  item: AppointmentRecord;
  // px a partir do topo da coluna do dia (00:00) e altura em px — sempre
  // derivados de formatDisplayTime/formatDisplayDate (fuso de exibição),
  // nunca de date-fns/fuso do navegador (AD-036).
  top: number;
  height: number;
  // Posição/total de colunas do cluster de itens sobrepostos que este item
  // pertence — a visão usa isso pra dividir a largura da coluna em N partes.
  column: number;
  columns: number;
};

const displayMinutesOfDay = (instant: string): number => {
  const [hours, minutes] = formatDisplayTime(instant).split(':').map(Number) as [number, number];
  return hours * 60 + minutes;
};

// Trecho do item que cai dentro de `day` (YYYY-MM-DD, fuso de exibição), em
// minutos desde 00:00. Um bloqueio pode atravessar vários dias (ex.: 18/09
// 00:00 -> 19/09 23:59): nos dias do meio o trecho é o dia inteiro, e nunca
// passa de 24h — senão o item vaza da coluna. `null` quando o item não toca
// o dia (inclusive quando termina exatamente às 00:00 dele).
const daySegment = (item: AppointmentRecord, day: string): { startMinutes: number; endMinutes: number } | null => {
  const startDay = formatDisplayDate(item.start);
  const endDay = formatDisplayDate(item.end);
  if (startDay > day || endDay < day) return null;

  const startMinutes = startDay === day ? displayMinutesOfDay(item.start) : 0;
  const endMinutes = endDay === day ? displayMinutesOfDay(item.end) : MINUTES_IN_DAY;
  if (startDay !== day && endMinutes === 0) return null;

  return { startMinutes, endMinutes: Math.max(endMinutes, startMinutes) };
};

export const itemOverlapsDay = (item: AppointmentRecord, day: string): boolean => daySegment(item, day) !== null;

// Layout de colunas sem sobreposição pra uma grade de um único dia: agrupa
// os trechos em clusters de horário que se cruzam e distribui cada cluster
// em N colunas iguais (algoritmo guloso clássico de coloração de intervalo,
// mesma ideia de computePositionedEvents do calendário de referência).
export function computePositionedItems(items: AppointmentRecord[], day: string): PositionedItem[] {
  const entries = items
    .flatMap((item) => {
      const segment = daySegment(item, day);
      return segment ? [{ item, ...segment }] : [];
    })
    .sort((a, b) => a.startMinutes - b.startMinutes);

  const positioned: PositionedItem[] = [];
  let cluster: typeof entries = [];
  let clusterEndMinutes = -Infinity;

  const flushCluster = () => {
    if (cluster.length === 0) return;
    const columnEndMinutes: number[] = [];
    const columnByEntry = cluster.map((entry) => {
      let column = columnEndMinutes.findIndex((end) => end <= entry.startMinutes);
      if (column === -1) column = columnEndMinutes.length;
      columnEndMinutes[column] = entry.endMinutes;
      return column;
    });

    const columns = columnEndMinutes.length;
    cluster.forEach((entry, index) => {
      const height = Math.max(((entry.endMinutes - entry.startMinutes) / 60) * HOUR_HEIGHT_PX, MIN_ITEM_HEIGHT_PX);
      // Item curtinho no fim do dia (ex.: 23:50) ganha a altura mínima e
      // passaria da última linha — sobe o bastante pra caber na coluna.
      const top = Math.min((entry.startMinutes / 60) * HOUR_HEIGHT_PX, COLUMN_HEIGHT_PX - height);
      positioned.push({ item: entry.item, top, height, column: columnByEntry[index] as number, columns });
    });
    cluster = [];
  };

  for (const entry of entries) {
    if (cluster.length > 0 && entry.startMinutes >= clusterEndMinutes) {
      flushCluster();
      clusterEndMinutes = -Infinity;
    }
    cluster.push(entry);
    clusterEndMinutes = Math.max(clusterEndMinutes, entry.endMinutes);
  }
  flushCluster();

  return positioned;
}
