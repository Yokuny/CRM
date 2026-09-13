import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge.js';
import { formatDisplayDate, formatDisplayTime } from '@/lib/helpers/displayTime.helper.js';
import { t } from '@/lib/helpers/translate.helper.js';
import type { AppointmentStatus } from '@/query/appointment.js';
import { upcomingAppointmentQuery } from '@/query/appointment.js';

type AppointmentCardProps = { customerId: string };

// findNextActiveByCustomer (packages/db) only ever returns `pending`/
// `confirmed` (SCH-38's "ativo") — the other AppointmentStatus values never
// reach this card, but the badge stays defensive rather than assuming it.
const badgeVariantForStatus = (status: AppointmentStatus): 'warning' | 'success' | 'secondary' => {
  if (status === 'pending') return 'warning';
  if (status === 'confirmed') return 'success';
  return 'secondary';
};

// spec.md P2 "Agendamento visível no Inbox"/SCH-38 (design.md Componente 6,
// context.md decisão 6): card inline com o próximo agendamento ATIVO do
// Customer desta thread — mesmo padrão estrutural de order-card.tsx (query
// -> sem dado -> não renderiza nada, inclusive durante o loading, pra não
// piscar UI vazia neste widget secundário dentro da thread).
export function AppointmentCard({ customerId }: AppointmentCardProps) {
  const query = useQuery(upcomingAppointmentQuery(customerId));

  const appointment = query.data;
  if (!appointment) return null;

  return (
    <div className="flex items-center gap-2 rounded-md border p-2">
      <Badge variant={badgeVariantForStatus(appointment.status)}>{t(`appointment.status.${appointment.status}`)}</Badge>
      <span className="text-sm">
        {formatDisplayDate(appointment.start)} · {formatDisplayTime(appointment.start)}
      </span>
      {appointment.professionalName && (
        <span className="text-muted-foreground text-sm">{appointment.professionalName}</span>
      )}
    </div>
  );
}
