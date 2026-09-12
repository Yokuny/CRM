import type { UseMutationOptions } from '@tanstack/react-query';
import { queryOptions } from '@tanstack/react-query';
import { getWithStatus, post } from '../lib/api/client.api.js';

// Espelha AppointmentConfirmationPublicView de
// apps/crm-api/src/services/appointmentConfirmation.service.ts — SEM ids
// internos por construção (SCH-22: "nunca dados de outro agendamento"), a
// verdade fica no back-end.
export type AppointmentConfirmationRecord = {
  date: string;
  time: string;
  professionalName?: string;
  spaceName?: string;
  customerName?: string;
  status: 'pending' | 'confirmed' | 'completed' | 'no_show' | 'canceled_by_customer' | 'canceled_by_operator';
};

export const appointmentConfirmationKeys = {
  all: ['appointmentConfirmation'] as const,
  detail: (token: string) => [...appointmentConfirmationKeys.all, token] as const,
};

// SCH-23: 404 (token inexistente) vs 410 (expirado) SHALL ser distinguíveis
// pela tela — o corpo `{success,message}` sozinho não basta
// (errorHandler.middleware.ts sempre devolve o mesmo formato de corpo pra
// qualquer status), daí `getWithStatus` (client.api.ts, T42) em vez de `get`.
// O `status` HTTP viaja no próprio erro lançado, pra `useQuery({...}).error`
// carregá-lo até o componente.
export class AppointmentConfirmationError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// SCH-22/SCH-27: identificado exclusivamente pelo token (nunca id) — rota
// pública, sem sessão.
export const appointmentConfirmationQuery = (token: string) =>
  queryOptions({
    queryKey: appointmentConfirmationKeys.detail(token),
    queryFn: async (): Promise<AppointmentConfirmationRecord> => {
      const res = await getWithStatus<AppointmentConfirmationRecord>(
        `/appointment-confirmations/${encodeURIComponent(token)}`,
      );
      if (!res.success || !res.data) {
        throw new AppointmentConfirmationError(res.message ?? 'Não foi possível carregar o agendamento.', res.status);
      }
      return res.data;
    },
  });

// SCH-25: confirma presença — idempotente sobre `confirmed` (o back-end
// devolve 200 com o mesmo estado, nunca erro, ao repetir com o mesmo token).
export const confirmAppointmentMutation = (): UseMutationOptions<AppointmentConfirmationRecord, Error, string> => ({
  mutationFn: async (token) => {
    const res = await post<AppointmentConfirmationRecord>(`/appointment-confirmations/${encodeURIComponent(token)}/confirm`);
    if (!res.success || !res.data) throw new Error(res.message ?? 'Não foi possível confirmar sua presença.');
    return res.data;
  },
});

// SCH-26: cancela pelo cliente. Nome distinto do `cancelAppointmentMutation`
// operador-side (query/appointment.ts, T37) — mesmo módulo/rota nunca
// importados juntos sob o mesmo identificador, mas o nome evita a colisão
// mesmo assim (indicado explicitamente pela task).
export const confirmationCancelMutation = (): UseMutationOptions<AppointmentConfirmationRecord, Error, string> => ({
  mutationFn: async (token) => {
    const res = await post<AppointmentConfirmationRecord>(`/appointment-confirmations/${encodeURIComponent(token)}/cancel`);
    if (!res.success || !res.data) throw new Error(res.message ?? 'Não foi possível cancelar seu agendamento.');
    return res.data;
  },
});
