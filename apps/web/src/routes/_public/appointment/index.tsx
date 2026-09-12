import { useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute, useSearch } from '@tanstack/react-router';
import { toast } from 'sonner';
import { DefaultLoading } from '@/components/default-loading.js';
import { ItemDescription, ItemTitle } from '@/components/ui/item.js';
import { t } from '@/lib/helpers/translate.helper.js';
import {
  AppointmentConfirmationError,
  appointmentConfirmationQuery,
  confirmAppointmentMutation,
  confirmationCancelMutation,
} from '@/query/appointmentConfirmation.js';
import { ConfirmationDetails } from './@components/confirmation-details.js';

type AppointmentConfirmationSearch = { token?: string };

// spec.md SCH-28: a única rota anônima de apps/web (sem sessão, `?token=`
// via search param — AD-030, mesmo padrão de `_public/invite/index.tsx`).
// `useSearch({strict:false})`, não `Route.useSearch()` — mesmo motivo já
// documentado em invite/index.tsx: o componente fica testável isolado do
// router real. Sem `<Card asPage>` (tela de pré-autenticação, mesma razão
// de AuthPage/InvitePage).
export function AppointmentConfirmationPage() {
  const { token } = useSearch({ strict: false }) as AppointmentConfirmationSearch;

  const query = useQuery({
    ...appointmentConfirmationQuery(token ?? ''),
    enabled: Boolean(token),
    retry: false,
  });
  const confirmMutation = useMutation(confirmAppointmentMutation());
  const cancelMutation = useMutation(confirmationCancelMutation());

  if (!token) {
    return (
      <div className="w-full max-w-sm">
        <ItemTitle className="mb-1 text-lg">{t('appointment_confirmation.title')}</ItemTitle>
        <ItemDescription role="alert">{t('appointment_confirmation.missing_token')}</ItemDescription>
      </div>
    );
  }

  if (query.isPending) {
    return <DefaultLoading />;
  }

  // SCH-23: 404 (token inexistente) vs 410 (expirado) são estados
  // VISIVELMENTE distintos — o `status` viaja no erro tipado
  // (AppointmentConfirmationError, query/appointmentConfirmation.ts).
  if (query.isError) {
    const status = query.error instanceof AppointmentConfirmationError ? query.error.status : undefined;
    const message =
      status === 404
        ? t('appointment_confirmation.not_found')
        : status === 410
          ? t('appointment_confirmation.expired')
          : t('appointment_confirmation.error');
    return (
      <div className="w-full max-w-sm">
        <ItemTitle className="mb-1 text-lg">{t('appointment_confirmation.title')}</ItemTitle>
        <ItemDescription role="alert">{message}</ItemDescription>
      </div>
    );
  }

  // TanStack Query 5 não estreita `data` a partir de `isPending`/`isError`
  // sozinho — os dois `if` acima já cobrem os únicos casos em que `data`
  // pode faltar, então este `return null` é inalcançável na prática.
  if (!query.data) return null;

  return (
    <ConfirmationDetails
      record={query.data}
      isConfirming={confirmMutation.isPending}
      isCanceling={cancelMutation.isPending}
      onConfirm={() =>
        confirmMutation.mutate(token, {
          onSuccess: () => query.refetch(),
          onError: (error: Error) => toast.error(error.message),
        })
      }
      onCancel={() =>
        cancelMutation.mutate(token, {
          onSuccess: () => query.refetch(),
          onError: (error: Error) => toast.error(error.message),
        })
      }
    />
  );
}

export const Route = createFileRoute('/_public/appointment/')({
  validateSearch: (search: Record<string, unknown>): AppointmentConfirmationSearch => ({
    token: typeof search.token === 'string' ? search.token : undefined,
  }),
  component: AppointmentConfirmationPage,
});
