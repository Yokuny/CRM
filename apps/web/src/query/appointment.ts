import type {
  CancelAppointment,
  CreateAppointment,
  CreateBlock,
  MarkAttendance,
  RescheduleAppointment,
} from '@crm/contracts';
import type { QueryClient, UseMutationOptions } from '@tanstack/react-query';
import { queryOptions } from '@tanstack/react-query';
import { del, get, post } from '../lib/api/client.api.js';

// Espelha AppointmentRecord de
// apps/crm-api/src/repositories/appointment.repository.ts — a verdade fica
// no back-end; este tipo só descreve o que a tela consome (mesma convenção
// de "espelho local" já usada em query/order.ts, OrderRecord). `start`/`end`
// chegam como string ISO em UTC (JSON não serializa Date) — a conversão pro
// fuso de exibição é feita só na borda de apresentação
// (displayTime.helper.ts, T38), nunca aqui.
export type AppointmentKind = 'appointment' | 'block';
export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'completed'
  | 'no_show'
  | 'canceled_by_customer'
  | 'canceled_by_operator';
export type AppointmentSource = 'ai' | 'operator';

export type AppointmentRecord = {
  id: string;
  kind: AppointmentKind;
  professional: string;
  professionalName?: string;
  space?: string;
  spaceName?: string;
  customer?: string;
  customerName?: string;
  conversation?: string;
  title?: string;
  notes?: string;
  start: string;
  end: string;
  status: AppointmentStatus;
  source: AppointmentSource;
  confirmedAt?: string;
  canceledAt?: string;
  canceledBy?: string;
  cancelReason?: string;
  attendanceMarkedAt?: string;
  attendanceMarkedBy?: string;
  createdAt: string;
  updatedAt: string;
};

// spec.md SCH-29: `from`/`to` em hora de parede (`YYYY-MM-DD`, faixa meio
// aberta `[from,to)` — AD-036), nunca instante ISO. `professional`/`space`
// filtram a mesma consulta (GET /appointments, appointment.router.ts).
export type AppointmentsQueryParams = {
  from: string;
  to: string;
  professional?: string;
  space?: string;
};

export const appointmentKeys = {
  all: ['appointment'] as const,
  lists: () => [...appointmentKeys.all, 'list'] as const,
  list: (params: AppointmentsQueryParams) => [...appointmentKeys.lists(), params] as const,
  upcoming: (customerId: string) => [...appointmentKeys.all, 'upcoming', customerId] as const,
};

const buildQueryString = (params: AppointmentsQueryParams): string => {
  const search = new URLSearchParams();
  search.set('from', params.from);
  search.set('to', params.to);
  if (params.professional) search.set('professional', params.professional);
  if (params.space) search.set('space', params.space);
  return `?${search.toString()}`;
};

// SCH-29: agenda semanal (agendamento E bloqueio, os dois `kind`) — todo o
// filtro de período/profissional/ambiente vem de `params` (AD-028,
// server-driven), nunca slice/filter em memória. Mesmo molde de
// query/order.ts (ordersQuery).
export const appointmentsQuery = (params: AppointmentsQueryParams) =>
  queryOptions({
    queryKey: appointmentKeys.list(params),
    queryFn: async (): Promise<AppointmentRecord[]> => {
      const res = await get<AppointmentRecord[]>(`/appointments${buildQueryString(params)}`);
      if (!res.success || !res.data) throw new Error(res.message ?? 'Não foi possível carregar a agenda.');
      return res.data;
    },
  });

// SCH-38: `null` (nenhum agendamento futuro ativo do cliente) é uma resposta
// válida, nunca um erro — só `success:false` (falha real) lança. Card inline
// do Inbox (T46, fase seguinte) consome esta mesma query.
export const upcomingAppointmentQuery = (customerId: string) =>
  queryOptions({
    queryKey: appointmentKeys.upcoming(customerId),
    queryFn: async (): Promise<AppointmentRecord | null> => {
      const res = await get<AppointmentRecord | null>(
        `/appointments/upcoming?customer=${encodeURIComponent(customerId)}`,
      );
      if (!res.success) throw new Error(res.message ?? 'Não foi possível carregar o próximo agendamento.');
      return res.data ?? null;
    },
  });

// SCH-30: encaixe do operador (POST /appointments) — `date`/`time` em hora
// de parede (createAppointmentSchema, @crm/contracts), nunca instante.
// Invalida toda appointmentsQuery cacheada no sucesso.
export const createAppointmentMutation = (
  queryClient: QueryClient,
): UseMutationOptions<AppointmentRecord, Error, CreateAppointment> => ({
  mutationFn: async (data) => {
    const res = await post<AppointmentRecord>('/appointments', data);
    if (!res.success || !res.data) throw new Error(res.message ?? 'Não foi possível criar o agendamento.');
    return res.data;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: appointmentKeys.lists() });
  },
});

// SCH-33: bloqueio de horário (POST /appointments/blocks) — `startDate`/
// `startTime`/`endDate`/`endTime` em hora de parede (createBlockSchema).
export const createBlockMutation = (
  queryClient: QueryClient,
): UseMutationOptions<AppointmentRecord, Error, CreateBlock> => ({
  mutationFn: async (data) => {
    const res = await post<AppointmentRecord>('/appointments/blocks', data);
    if (!res.success || !res.data) throw new Error(res.message ?? 'Não foi possível criar o bloqueio.');
    return res.data;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: appointmentKeys.lists() });
  },
});

export type DeleteBlockResult = { deleted: true };

// SCH-33: remove um bloqueio (DELETE /appointments/blocks/:id — mesmo
// endpoint por trás do "Remover" do block-dialog, T41).
export const deleteBlockMutation = (
  queryClient: QueryClient,
): UseMutationOptions<DeleteBlockResult, Error, { id: string }> => ({
  mutationFn: async ({ id }) => {
    const res = await del<DeleteBlockResult>(`/appointments/blocks/${encodeURIComponent(id)}`);
    if (!res.success || !res.data) throw new Error(res.message ?? 'Não foi possível remover o bloqueio.');
    return res.data;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: appointmentKeys.lists() });
  },
});

// SCH-39/40 (T44): espelha AppointmentNotice de appointment.service.ts —
// `queued` quando a janela de 24h está aberta (Message enfileirada na
// outbox), `wa_me` quando não (nenhuma Message criada, link pronto).
export type AppointmentNotice = { kind: 'queued' } | { kind: 'wa_me'; url: string };
export type AppointmentActionResult = { appointment: AppointmentRecord; notice?: AppointmentNotice };

// SCH-32: cancelamento pelo operador (POST /appointments/:id/cancel),
// `reason` opcional (cancelAppointmentSchema). Invalida a lista E, quando o
// registro atualizado tem `customer`, a upcomingAppointmentQuery daquele
// cliente (o card do Inbox, SCH-38, depende do mesmo cache). A resposta
// também carrega `notice` (T44/T45) — o componente decide o que mostrar.
export const cancelAppointmentMutation = (
  queryClient: QueryClient,
): UseMutationOptions<AppointmentActionResult, Error, { id: string; data: CancelAppointment }> => ({
  mutationFn: async ({ id, data }) => {
    const res = await post<AppointmentActionResult>(`/appointments/${encodeURIComponent(id)}/cancel`, data);
    if (!res.success || !res.data) throw new Error(res.message ?? 'Não foi possível cancelar o agendamento.');
    return res.data;
  },
  onSuccess: (result) => {
    queryClient.invalidateQueries({ queryKey: appointmentKeys.lists() });
    if (result.appointment.customer) {
      queryClient.invalidateQueries({ queryKey: appointmentKeys.upcoming(result.appointment.customer) });
    }
  },
});

// SCH-31: remarcação — mesmo Appointment, novo horário (hora de parede,
// rescheduleAppointmentSchema) e profissional opcional. Mesma invalidação e
// mesmo `notice` de cancelAppointmentMutation.
export const rescheduleAppointmentMutation = (
  queryClient: QueryClient,
): UseMutationOptions<AppointmentActionResult, Error, { id: string; data: RescheduleAppointment }> => ({
  mutationFn: async ({ id, data }) => {
    const res = await post<AppointmentActionResult>(`/appointments/${encodeURIComponent(id)}/reschedule`, data);
    if (!res.success || !res.data) throw new Error(res.message ?? 'Não foi possível remarcar o agendamento.');
    return res.data;
  },
  onSuccess: (result) => {
    queryClient.invalidateQueries({ queryKey: appointmentKeys.lists() });
    if (result.appointment.customer) {
      queryClient.invalidateQueries({ queryKey: appointmentKeys.upcoming(result.appointment.customer) });
    }
  },
});

// SCH-34: comparecimento (`completed`/`no_show`, markAttendanceSchema).
// Mesma invalidação de cancelAppointmentMutation.
export const markAttendanceMutation = (
  queryClient: QueryClient,
): UseMutationOptions<AppointmentRecord, Error, { id: string; data: MarkAttendance }> => ({
  mutationFn: async ({ id, data }) => {
    const res = await post<AppointmentRecord>(`/appointments/${encodeURIComponent(id)}/attendance`, data);
    if (!res.success || !res.data) throw new Error(res.message ?? 'Não foi possível marcar o comparecimento.');
    return res.data;
  },
  onSuccess: (updated) => {
    queryClient.invalidateQueries({ queryKey: appointmentKeys.lists() });
    if (updated.customer) queryClient.invalidateQueries({ queryKey: appointmentKeys.upcoming(updated.customer) });
  },
});

export type ConfirmationLinkResult = { confirmationUrl: string; waMeUrl: string };

// SCH-37: "Pedir confirmação" (POST /appointments/:id/confirmation-link, sem
// corpo) — devolve o link wa.me com o texto pronto (appointment.service.ts's
// requestConfirmationLink). Um agendamento de outro tenant ou inexistente
// responde 404, que chega aqui como `success:false` (mesmo tratamento das
// demais mutações desta função).
export const requestConfirmationLinkMutation = (
  queryClient: QueryClient,
): UseMutationOptions<ConfirmationLinkResult, Error, { id: string }> => ({
  mutationFn: async ({ id }) => {
    const res = await post<ConfirmationLinkResult>(`/appointments/${encodeURIComponent(id)}/confirmation-link`);
    if (!res.success || !res.data) throw new Error(res.message ?? 'Não foi possível gerar o link de confirmação.');
    return res.data;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: appointmentKeys.lists() });
  },
});
