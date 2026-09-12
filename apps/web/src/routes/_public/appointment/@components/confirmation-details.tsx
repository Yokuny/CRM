import { Button } from '@/components/ui/button.js';
import { ItemDescription, ItemTitle } from '@/components/ui/item.js';
import { weekdayIndexOfDisplayDate } from '@/lib/helpers/displayTime.helper.js';
import { t } from '@/lib/helpers/translate.helper.js';
import type { AppointmentConfirmationRecord } from '@/query/appointmentConfirmation.js';

export type ConfirmationDetailsProps = {
  record: AppointmentConfirmationRecord;
  onConfirm: () => void;
  onCancel: () => void;
  isConfirming: boolean;
  isCanceling: boolean;
};

// SCH-25/SCH-26: `confirmed`/`pending` são os únicos estados de onde uma
// ação ainda faz sentido — um estado terminal (completed/no_show/canceled_*)
// não oferece mais os botões, só mostra o status final (nenhuma tentativa de
// ação sobre estado terminal, que o back-end recusaria com erro de qualquer
// forma).
const ACTIONABLE_STATUSES: AppointmentConfirmationRecord['status'][] = ['pending', 'confirmed'];

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b pb-2">
      <ItemDescription>{label}</ItemDescription>
      <ItemDescription className="text-right font-medium text-foreground">{value}</ItemDescription>
    </div>
  );
}

// Porte da estrutura (título+descrição, linhas de info, dois botões, nota de
// rodapé) de
// ../DentalEase/DentalEase/src/routes/_public/schedule/$code/@components/confirmation-form.tsx
// — SEM redirect pra `/auth` no sucesso (este cliente não tem conta, SCH-28)
// e usando `date`/`time` exatamente como o back-end já devolve (hora de
// exibição, AppointmentConfirmationPublicView) — nunca reformatados via
// `formatDisplayDate`/`formatDisplayTime` (T38), que esperam um INSTANTE UTC;
// aqui só o dia-da-semana é derivado (`weekdayIndexOfDisplayDate`, cálculo de
// calendário puro, seguro sobre uma data de parede já pronta).
export function ConfirmationDetails({ record, onConfirm, onCancel, isConfirming, isCanceling }: ConfirmationDetailsProps) {
  const isActionable = ACTIONABLE_STATUSES.includes(record.status);
  const weekday = t(`weekday.${weekdayIndexOfDisplayDate(record.date)}`);

  return (
    <div className="w-full max-w-sm space-y-6">
      <div>
        <ItemTitle className="text-lg">{t('appointment_confirmation.title')}</ItemTitle>
        <ItemDescription>{t('appointment_confirmation.description')}</ItemDescription>
      </div>

      <div className="grid gap-2">
        <Row label={t('appointment.field.date')} value={`${weekday}, ${record.date}`} />
        <Row label={t('appointment.field.time')} value={record.time} />
        {record.professionalName && <Row label={t('appointment.field.professional')} value={record.professionalName} />}
        {record.spaceName && <Row label={t('appointment.field.space')} value={record.spaceName} />}
        {record.customerName && <Row label={t('appointment.field.customer')} value={record.customerName} />}
        <Row label={t('status')} value={t(`appointment.status.${record.status}`)} />
      </div>

      {isActionable && (
        <div className="flex gap-3">
          <Button type="button" className="flex-1" onClick={onConfirm} disabled={isConfirming || isCanceling}>
            {t('appointment_confirmation.confirm_action')}
          </Button>
          <Button
            type="button"
            variant="basic"
            className="flex-1"
            onClick={onCancel}
            disabled={isConfirming || isCanceling}
          >
            {t('appointment_confirmation.cancel_action')}
          </Button>
        </div>
      )}

      <ItemDescription className="text-center text-xs">{t('appointment_confirmation.footer_note')}</ItemDescription>
    </div>
  );
}
