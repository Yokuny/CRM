import { Button } from '@/components/ui/button.js';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item.js';
import { weekdayIndexOfDisplayDate } from '@/lib/helpers/displayTime.helper.js';
import { t, WEEKDAY_KEYS } from '@/lib/helpers/translate.helper.js';
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
    <Item>
      <ItemContent className="flex-row items-center justify-between gap-4">
        <ItemDescription>{label}</ItemDescription>
        <ItemDescription className="text-right font-medium text-foreground">{value}</ItemDescription>
      </ItemContent>
    </Item>
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
export function ConfirmationDetails({
  record,
  onConfirm,
  onCancel,
  isConfirming,
  isCanceling,
}: ConfirmationDetailsProps) {
  const isActionable = ACTIONABLE_STATUSES.includes(record.status);
  const weekday = t(WEEKDAY_KEYS[weekdayIndexOfDisplayDate(record.date)]);

  return (
    <div className="w-full max-w-sm space-y-6">
      <div>
        <ItemTitle className="text-lg">{t('appointment_confirmation')}</ItemTitle>
        <ItemDescription>{t('review_and_confirm_attendance')}</ItemDescription>
      </div>

      <ItemGroup>
        <Row label={t('date')} value={`${weekday}, ${record.date}`} />
        <Row label={t('time')} value={record.time} />
        {record.professionalName && <Row label={t('professional')} value={record.professionalName} />}
        {record.spaceName && <Row label={t('space')} value={record.spaceName} />}
        {record.customerName && <Row label={t('customer')} value={record.customerName} />}
        <Row label={t('status')} value={t(record.status)} />
      </ItemGroup>

      {isActionable && (
        <div className="flex gap-3">
          <Button type="button" className="flex-1" onClick={onConfirm} disabled={isConfirming || isCanceling}>
            {t('confirm_attendance')}
          </Button>
          <Button
            type="button"
            variant="basic"
            className="flex-1"
            onClick={onCancel}
            disabled={isConfirming || isCanceling}
          >
            {t('will_not_attend')}
          </Button>
        </div>
      )}

      <ItemDescription className="text-center text-xs">{t('contact_for_questions')}</ItemDescription>
    </div>
  );
}
