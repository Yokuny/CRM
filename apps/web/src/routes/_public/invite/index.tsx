import { type AcceptInvite, acceptInviteSchema } from '@crm/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { createRoute, useNavigate, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { DefaultLoading } from '../../../components/default-loading.js';
import { Card, CardContent, CardHeader } from '../../../components/ui/card.js';
import { get, post } from '../../../lib/api/client.api.js';
import { t } from '../../../lib/helpers/translate.helper.js';
import { Route as rootRoute } from '../../__root.js';

type InvitePeek = { tenantName: string; email: string };
type InviteSearch = { token?: string };

// FND-10/AC1: token via search param (?token=), NUNCA $id/path param — regra
// explícita do design (Tech Decisions). useSearch({strict:false}), não
// Route.useSearch(), para o componente ficar testável isolado do router real.
export function InvitePage() {
  const { token } = useSearch({ strict: false }) as InviteSearch;
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<string | undefined>();

  const peekQuery = useQuery({
    queryKey: ['invite', 'peek', token],
    queryFn: async (): Promise<InvitePeek> => {
      const res = await get<InvitePeek>(`/invites/${encodeURIComponent(token as string)}`);
      if (!res.success || !res.data) throw new Error(res.message || t('invite.accept.invalid'));
      return res.data;
    },
    enabled: Boolean(token),
    retry: false,
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AcceptInvite>({ resolver: zodResolver(acceptInviteSchema) });

  const onSubmit = async (data: AcceptInvite) => {
    setSubmitError(undefined);
    const res = await post(`/invites/${encodeURIComponent(token as string)}/accept`, data);
    if (!res.success) {
      setSubmitError(res.message || t('invite.accept.error'));
      return;
    }
    navigate({ to: '/' });
  };

  return (
    <Card asPage>
      <CardHeader title={t('invite.accept.title')} />
      <CardContent>
        {!token ? (
          <p role="alert">{t('invite.accept.missing_token')}</p>
        ) : peekQuery.isPending ? (
          <DefaultLoading />
        ) : peekQuery.isError ? (
          <p role="alert">{peekQuery.error instanceof Error ? peekQuery.error.message : t('invite.accept.invalid')}</p>
        ) : (
          <>
            <p>
              {t('invite.accept.invited_to')}: {peekQuery.data.tenantName}
            </p>
            <p>{peekQuery.data.email}</p>
            <form onSubmit={handleSubmit(onSubmit)} noValidate>
              <label htmlFor="name">{t('name')}</label>
              <input id="name" autoComplete="name" {...register('name')} />
              {errors.name && <span role="alert">{errors.name.message}</span>}

              <label htmlFor="password">{t('password')}</label>
              <input id="password" type="password" autoComplete="new-password" {...register('password')} />
              {errors.password && <span role="alert">{errors.password.message}</span>}

              {submitError && <p role="alert">{submitError}</p>}

              <button type="submit" disabled={isSubmitting}>
                {t('invite.accept.submit')}
              </button>
            </form>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/invite',
  validateSearch: (search: Record<string, unknown>): InviteSearch => ({
    token: typeof search.token === 'string' ? search.token : undefined,
  }),
  component: InvitePage,
});
