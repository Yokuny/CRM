import type { CSSProperties } from 'react';
import { formatDisplayTime, isPastInstant } from '@/lib/helpers/displayTime.helper.js';
import { cn } from '@/lib/utils.js';
import type { AppointmentRecord } from '@/query/appointment.js';

const ACTIVE_STATUSES: AppointmentRecord['status'][] = ['pending', 'confirmed'];
const CANCELED_STATUSES: AppointmentRecord['status'][] = ['canceled_by_customer', 'canceled_by_operator'];

// Mesma paleta semântica que já existia em week-grid.tsx (status ->
// cor) — centralizada aqui pra ser compartilhada pelas visões de
// dia/semana (TimeGridView) e mês (MonthView).
const statusColorClasses = (status: AppointmentRecord['status']): string | false => {
  if (CANCELED_STATUSES.includes(status)) return 'border-muted-foreground/30 bg-muted text-muted-foreground';
  if (status === 'completed') {
    return 'border-emerald-600/30 bg-emerald-50 text-emerald-900 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-400';
  }
  if (status === 'no_show') {
    return 'border-red-600/20 bg-red-50 text-red-900 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-400';
  }
  return false;
};

export type CalendarEventChipProps = {
  item: AppointmentRecord;
  onSelect: (item: AppointmentRecord) => void;
  // 'timed': mostra o intervalo de horário completo (visões de dia/semana,
  // posicionado por cima da grade de hora). 'compact': uma linha só, usado
  // na visão de mês e no popover de "+N".
  variant?: 'timed' | 'compact';
  className?: string;
  style?: CSSProperties;
};

// Bloqueio (kind:'block') ganha estilo tracejado distinto; um agendamento
// pending/confirmed cujo start já passou é destacado como "vencido sem
// marcação" (SCH-35) — mesmo comportamento que já existia em week-grid.tsx,
// agora reaproveitado pelas 3 visões.
export function CalendarEventChip({ item, onSelect, variant = 'timed', className, style }: CalendarEventChipProps) {
  const isBlock = item.kind === 'block';
  const isOverdue = !isBlock && ACTIVE_STATUSES.includes(item.status) && isPastInstant(item.start);
  const label = isBlock ? item.title : (item.customerName ?? item.professionalName);

  return (
    <button
      type="button"
      data-testid={`calendar-event-${item.id}`}
      onClick={() => onSelect(item)}
      style={style}
      className={cn(
        'rounded-sm border text-left text-xs',
        variant === 'compact' ? 'w-full truncate px-1.5 py-0.5' : 'overflow-hidden p-1.5',
        isBlock ? 'border-dashed bg-muted text-muted-foreground' : 'bg-background',
        !isBlock && statusColorClasses(item.status),
        isOverdue && 'border-destructive bg-destructive/10 text-destructive',
        className,
      )}
    >
      {variant === 'timed' ? (
        <>
          <div className="font-medium">
            {formatDisplayTime(item.start)}–{formatDisplayTime(item.end)}
          </div>
          <div className="truncate">{label}</div>
        </>
      ) : (
        <span>
          <span className="font-medium">{formatDisplayTime(item.start)}</span> {label}
        </span>
      )}
    </button>
  );
}
