import {
  type CreateAppointment,
  createAppointmentSchema,
  type RescheduleAppointment,
  rescheduleAppointmentSchema,
} from '@crm/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X as IconClose } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.js';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form.js';
import { Input } from '@/components/ui/input.js';
import { ItemDescription } from '@/components/ui/item.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { formatDisplayDate, formatDisplayTime, isPastInstant } from '@/lib/helpers/displayTime.helper.js';
import { t } from '@/lib/helpers/translate.helper.js';
import {
  type AppointmentRecord,
  cancelAppointmentMutation,
  createAppointmentMutation,
  markAttendanceMutation,
  requestConfirmationLinkMutation,
  rescheduleAppointmentMutation,
} from '@/query/appointment.js';
import { customersQuery } from '@/query/customer.js';
import { professionalsQuery } from '@/query/professional.js';
import { spacesQuery } from '@/query/space.js';

// Sentinel de "sem ambiente" pro <Select> opcional (Radix não aceita
// `value=""` — mesmo raciocínio de calendar/index.tsx's ALL_FILTER_VALUE),
// convertido de volta pra `undefined` no próprio `onValueChange`, nunca
// enviado ao back-end.
const UNSET_VALUE = '__none__';
const QUERY_LIMIT = 100;

export type AppointmentPanelProps = {
  onClose: () => void;
  // Ausente => modo "criar" (encaixe, SCH-30); presente => modo
  // "detalhe/ação" sobre um Appointment existente (cancelar/remarcar/
  // comparecimento/pedir confirmação).
  appointment?: AppointmentRecord;
};

// T40 (revisado): painel INLINE, nunca um Dialog modal — feedback explícito
// do usuário ("sempre evitar usar dialog, sempre renderizar abrindo campo
// abaixo empurrando o resto da UI"). O componente só existe na árvore
// enquanto deve estar visível (calendar/index.tsx decide isso, montando/
// desmontando), então não há estado interno de "aberto"; `onClose` é só o
// sinal pro pai desmontar. Renderizado num `<div>` de bloco comum — como o
// pai o posiciona em fluxo normal (nunca posição fixa/overlay), ele empurra
// o conteúdo abaixo dele, exatamente o efeito pedido.
export function AppointmentPanel({ onClose, appointment }: AppointmentPanelProps) {
  return (
    <div className="grid gap-4 rounded-md border p-4">
      {appointment ? (
        <AppointmentDetail appointment={appointment} onClose={onClose} />
      ) : (
        <AppointmentCreateForm onClose={onClose} />
      )}
    </div>
  );
}

type WithOnClose = { onClose: () => void };

// Cabeçalho comum: título + botão de fechar explícito — sem a borda "X"
// automática que o Dialog dava de graça, o painel inline precisa da própria.
// `<h2>` de verdade (não `ItemTitle`, que renderiza `<div>`, sem `asChild`
// nesta versão do componente): preserva `role="heading"` pra quem navega por
// leitor de tela ou testa por role, mesmo estilo visual de ItemTitle via className.
function PanelHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="flex w-fit items-center gap-2 font-medium font-mono text-sm leading-snug">{title}</h2>
      <Button type="button" variant="basic" size="sm" onClick={onClose} aria-label={t('close')}>
        <IconClose className="size-4" />
      </Button>
    </div>
  );
}

// SCH-30: encaixe do operador — client/professional/space vêm de queries já
// existentes (customersQuery, feature customers; professionalsQuery/
// spacesQuery, Batch 6), `date`/`time` em hora de parede (createAppointmentSchema,
// AD-036), validados por `zodResolver` (mesmo padrão canônico de
// routes/_public/auth/index.tsx).
function AppointmentCreateForm({ onClose }: WithOnClose) {
  const queryClient = useQueryClient();
  const customersQueryResult = useQuery(customersQuery({ limit: QUERY_LIMIT }));
  const professionalsQueryResult = useQuery(professionalsQuery({ limit: QUERY_LIMIT }));
  const spacesQueryResult = useQuery(spacesQuery({ limit: QUERY_LIMIT }));

  const form = useForm<CreateAppointment>({
    resolver: zodResolver(createAppointmentSchema),
    defaultValues: { customerId: '', professionalId: '', date: '', time: '', spaceId: undefined, notes: '' },
  });
  const mutation = useMutation(createAppointmentMutation(queryClient));

  // WEB-13-style: guarda contra duplo-clique, mesmo padrão de products/add/index.tsx.
  const onSubmit = (data: CreateAppointment) => {
    if (mutation.isPending) return;
    mutation.mutate(
      { ...data, notes: data.notes?.trim() ? data.notes.trim() : undefined },
      {
        onSuccess: () => {
          form.reset();
          onClose();
        },
        // 409 (sobreposição, SCH-30) ou qualquer outra falha vira toast — mesmo
        // idioma de composer.tsx (`onError: (error) => toast.error(error.message)`).
        onError: (error: Error) => toast.error(error.message),
      },
    );
  };

  return (
    <>
      <PanelHeader title={t('appointment.create.title')} onClose={onClose} />
      <Form {...form}>
        <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
          <FormField
            control={form.control}
            name="customerId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('appointment.field.customer')}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t('appointment.field.customer')} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {(customersQueryResult.data?.items ?? []).map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="professionalId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('appointment.field.professional')}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t('appointment.field.professional')} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {(professionalsQueryResult.data?.items ?? []).map((professional) => (
                      <SelectItem key={professional.id} value={professional.id}>
                        {professional.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('appointment.field.date')}</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="time"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('appointment.field.time')}</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="spaceId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('appointment.field.space')}</FormLabel>
                <Select
                  value={field.value ?? UNSET_VALUE}
                  onValueChange={(value) => field.onChange(value === UNSET_VALUE ? undefined : value)}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t('appointment.field.space')} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={UNSET_VALUE}>{t('appointment.field.space_none')}</SelectItem>
                    {(spacesQueryResult.data?.items ?? []).map((space) => (
                      <SelectItem key={space.id} value={space.id}>
                        {space.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('appointment.field.notes')}</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={mutation.isPending}>
              {t('save')}
            </Button>
          </div>
        </form>
      </Form>
    </>
  );
}

type AppointmentDetailProps = WithOnClose & { appointment: AppointmentRecord };

// SCH-31/32/34/37: as quatro ações do operador sobre um Appointment já
// existente. Cada mutação (T37) já invalida `appointmentKeys.lists()` —
// nenhuma atualização otimista aqui, o WeekGrid reflete o novo estado quando
// a query da tela é refeita.
function AppointmentDetail({ appointment, onClose }: AppointmentDetailProps) {
  const queryClient = useQueryClient();
  const professionalsQueryResult = useQuery(professionalsQuery({ limit: QUERY_LIMIT }));
  const [reason, setReason] = useState('');

  const cancelMutation = useMutation(cancelAppointmentMutation(queryClient));
  const attendanceMutation = useMutation(markAttendanceMutation(queryClient));
  const confirmationMutation = useMutation(requestConfirmationLinkMutation(queryClient));

  const rescheduleForm = useForm<RescheduleAppointment>({
    resolver: zodResolver(rescheduleAppointmentSchema),
    defaultValues: {
      date: formatDisplayDate(appointment.start),
      time: formatDisplayTime(appointment.start),
      professionalId: undefined,
    },
  });
  const rescheduleMutation = useMutation(rescheduleAppointmentMutation(queryClient));

  // SCH-34: comparecimento só pode ser marcado DEPOIS do horário de início —
  // o controle fica desabilitado antes disso, nunca escondido (o operador
  // precisa entender POR QUE não pode marcar ainda).
  const canMarkAttendance = isPastInstant(appointment.start);

  const handleCancel = () => {
    if (cancelMutation.isPending) return;
    cancelMutation.mutate(
      { id: appointment.id, data: { reason: reason.trim() ? reason.trim() : undefined } },
      { onSuccess: () => onClose(), onError: (error: Error) => toast.error(error.message) },
    );
  };

  const onReschedule = (data: RescheduleAppointment) => {
    if (rescheduleMutation.isPending) return;
    rescheduleMutation.mutate(
      { id: appointment.id, data },
      { onSuccess: () => onClose(), onError: (error: Error) => toast.error(error.message) },
    );
  };

  const handleAttendance = (status: 'completed' | 'no_show') => {
    if (attendanceMutation.isPending) return;
    attendanceMutation.mutate(
      { id: appointment.id, data: { status } },
      { onSuccess: () => onClose(), onError: (error: Error) => toast.error(error.message) },
    );
  };

  // SCH-37: abre o wa.me devolvido pela mutação numa nova aba — mesmo idioma
  // de inbox/@components/composer.tsx (`target="_blank"`), aqui via
  // `window.open` porque a URL só existe DEPOIS da resposta da mutação (não
  // dá pra fixar um `href` estático de antemão).
  const handleRequestConfirmation = () => {
    if (confirmationMutation.isPending) return;
    confirmationMutation.mutate(
      { id: appointment.id },
      {
        onSuccess: (result) => window.open(result.waMeUrl, '_blank', 'noreferrer'),
        onError: (error: Error) => toast.error(error.message),
      },
    );
  };

  return (
    <>
      <PanelHeader
        title={appointment.customerName ?? appointment.title ?? t('appointment.detail.title')}
        onClose={onClose}
      />
      <div className="grid gap-1" data-testid="appointment-detail-info">
        <ItemDescription>
          {formatDisplayDate(appointment.start)} · {formatDisplayTime(appointment.start)}–
          {formatDisplayTime(appointment.end)}
        </ItemDescription>
        {appointment.professionalName && <ItemDescription>{appointment.professionalName}</ItemDescription>}
        {appointment.spaceName && <ItemDescription>{appointment.spaceName}</ItemDescription>}
        <ItemDescription>{t(`appointment.status.${appointment.status}`)}</ItemDescription>
      </div>

      <Form {...rescheduleForm}>
        <form
          noValidate
          onSubmit={rescheduleForm.handleSubmit(onReschedule)}
          className="grid gap-3 rounded-md border p-3"
        >
          <ItemDescription>{t('appointment.action.reschedule')}</ItemDescription>
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={rescheduleForm.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('appointment.field.date')}</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={rescheduleForm.control}
              name="time"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('appointment.field.time')}</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={rescheduleForm.control}
            name="professionalId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('appointment.field.professional')}</FormLabel>
                <Select
                  value={field.value ?? UNSET_VALUE}
                  onValueChange={(value) => field.onChange(value === UNSET_VALUE ? undefined : value)}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={appointment.professionalName ?? t('appointment.field.professional')} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={UNSET_VALUE}>
                      {appointment.professionalName ?? t('appointment.field.professional')}
                    </SelectItem>
                    {(professionalsQueryResult.data?.items ?? []).map((professional) => (
                      <SelectItem key={professional.id} value={professional.id}>
                        {professional.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <div>
            <Button type="submit" variant="basic" disabled={rescheduleMutation.isPending}>
              {t('confirm')}
            </Button>
          </div>
        </form>
      </Form>

      <div className="grid gap-2 rounded-md border p-3">
        <ItemDescription>{t('appointment.action.cancel')}</ItemDescription>
        <Input
          placeholder={t('appointment.cancel.reason_placeholder')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div>
          <Button type="button" variant="basic" disabled={cancelMutation.isPending} onClick={handleCancel}>
            {t('appointment.action.cancel')}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="basic"
          disabled={!canMarkAttendance || attendanceMutation.isPending}
          onClick={() => handleAttendance('completed')}
        >
          {t('appointment.attendance.completed')}
        </Button>
        <Button
          type="button"
          variant="basic"
          disabled={!canMarkAttendance || attendanceMutation.isPending}
          onClick={() => handleAttendance('no_show')}
        >
          {t('appointment.attendance.no_show')}
        </Button>
        <Button type="button" disabled={confirmationMutation.isPending} onClick={handleRequestConfirmation}>
          {t('appointment.action.request_confirmation')}
        </Button>
      </div>
    </>
  );
}
