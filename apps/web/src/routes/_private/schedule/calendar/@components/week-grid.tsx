import {
  addDaysToDisplayDate,
  formatDisplayDate,
  formatDisplayTime,
  isPastInstant,
  weekdayIndexOfDisplayDate,
} from '@/lib/helpers/displayTime.helper.js';
import { t } from '@/lib/helpers/translate.helper.js';
import { cn } from '@/lib/utils.js';
import type { AppointmentRecord } from '@/query/appointment.js';

export type WeekGridProps = {
  // Segunda-feira (convenção deste projeto, displayTime.helper.ts) da semana
  // exibida, `YYYY-MM-DD` no fuso de exibição — nunca um instante.
  weekStart: string;
  // Agendamento E bloqueio (os dois `kind`) — `start`/`end` chegam como
  // instante ISO em UTC, só formatados no fuso de exibição na hora de
  // renderizar (nunca no fuso do navegador, AD-036).
  items: AppointmentRecord[];
  onSelect: (item: AppointmentRecord) => void;
};

const DAYS_IN_WEEK = 7;
const ACTIVE_STATUSES: AppointmentRecord['status'][] = ['pending', 'confirmed'];

// SCH-29/SCH-35: 7 colunas de dia a partir de `weekStart`, cada item
// posicionado/rotulado só via displayTime.helper.ts (nunca `formatDate.helper.ts`
// nem o fuso local do navegador — design.md Risk citado no cabeçalho de
// displayTime.helper.ts). Bloqueio (`kind:'block'`) ganha um estilo visual
// distinto de agendamento; um agendamento `pending`/`confirmed` cujo `start`
// já passou é destacado como "vencido sem marcação" (SCH-35) — nenhuma
// transição de estado acontece aqui, só o destaque visual.
export function WeekGrid({ weekStart, items, onSelect }: WeekGridProps) {
  const days = Array.from({ length: DAYS_IN_WEEK }, (_, index) => addDaysToDisplayDate(weekStart, index));

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-7" data-testid="week-grid">
      {days.map((day) => {
        const dayItems = items
          .filter((item) => formatDisplayDate(item.start) === day)
          .sort((a, b) => a.start.localeCompare(b.start));

        return (
          <div key={day} data-testid={`week-grid-day-${day}`} className="flex flex-col gap-2 rounded-md border p-2">
            <div className="text-center">
              <div className="font-medium text-sm">{t(`weekday.${weekdayIndexOfDisplayDate(day)}`)}</div>
              <div className="text-muted-foreground text-xs">{day}</div>
            </div>
            <div className="flex flex-col gap-1.5">
              {dayItems.map((item) => {
                const isBlock = item.kind === 'block';
                const isOverdue =
                  !isBlock && ACTIVE_STATUSES.includes(item.status) && isPastInstant(item.start);

                return (
                  <button
                    key={item.id}
                    type="button"
                    data-testid={`week-grid-item-${item.id}`}
                    onClick={() => onSelect(item)}
                    className={cn(
                      'rounded-sm border p-1.5 text-left text-xs',
                      isBlock ? 'border-dashed bg-muted text-muted-foreground' : 'bg-background',
                      isOverdue && 'border-destructive bg-destructive/10 text-destructive',
                    )}
                  >
                    <div className="font-medium">
                      {formatDisplayTime(item.start)}–{formatDisplayTime(item.end)}
                    </div>
                    <div>{isBlock ? item.title : (item.customerName ?? item.professionalName)}</div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
