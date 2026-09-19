import {
  CalendarTimeGrid,
  CalendarTimeGridColumns,
  CalendarTimeGridHeader,
  CalendarTimeGridHourLine,
} from '@/components/ui/calendar-grid.js';
import { weekdayIndexOfDisplayDate } from '@/lib/helpers/displayTime.helper.js';
import { formatDate } from '@/lib/helpers/formatDate.helper.js';
import { t, WEEKDAY_KEYS } from '@/lib/helpers/translate.helper.js';
import type { AppointmentRecord } from '@/query/appointment.js';
import { computePositionedItems, HOUR_HEIGHT_PX, HOURS_IN_DAY } from '../@utils/calendar-grid.utils.js';
import { CalendarEventChip } from './calendar-event.js';

export type TimeGridViewProps = {
  // Datas de parede (YYYY-MM-DD, fuso de exibição) das colunas — 1 elemento
  // pra visão de dia, 7 pra visão de semana; mesmo componente pros dois.
  days: string[];
  items: AppointmentRecord[];
  onSelect: (item: AppointmentRecord) => void;
};

const HOURS = Array.from({ length: HOURS_IN_DAY }, (_, hour) => hour);

// Grade por hora com eventos posicionados por horário/duração
// (calendar-grid.utils.ts). Moldura e linhas tracejadas vêm do primitivo
// (components/ui/calendar-grid.tsx) — aqui só composição e posição.
export function TimeGridView({ days, items, onSelect }: TimeGridViewProps) {
  return (
    <CalendarTimeGrid className="min-w-160" data-testid="time-grid-view">
      <div className="w-10 shrink-0">
        <CalendarTimeGridHeader />
        {HOURS.map((hour) => (
          <div
            key={hour}
            style={{ height: HOUR_HEIGHT_PX }}
            className="pr-1 text-right text-[10px] text-muted-foreground"
          >
            {String(hour).padStart(2, '0')}h
          </div>
        ))}
      </div>
      <CalendarTimeGridColumns style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
        {days.map((day) => {
          const positioned = computePositionedItems(items, day);

          return (
            <div key={day} data-testid={`time-grid-day-${day}`}>
              <CalendarTimeGridHeader>
                <div className="font-medium text-xs">{t(WEEKDAY_KEYS[weekdayIndexOfDisplayDate(day)])}</div>
                <div className="text-[10px] text-muted-foreground">{formatDate(day)}</div>
              </CalendarTimeGridHeader>
              <div className="relative" style={{ height: HOURS_IN_DAY * HOUR_HEIGHT_PX }}>
                {HOURS.slice(1).map((hour) => (
                  <CalendarTimeGridHourLine key={hour} style={{ top: hour * HOUR_HEIGHT_PX }} />
                ))}
                {positioned.map(({ item, top, height, column, columns }) => (
                  <CalendarEventChip
                    key={item.id}
                    item={item}
                    onSelect={onSelect}
                    variant="timed"
                    className="absolute"
                    style={{ top, height, left: `${(column / columns) * 100}%`, width: `${100 / columns}%` }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </CalendarTimeGridColumns>
    </CalendarTimeGrid>
  );
}
