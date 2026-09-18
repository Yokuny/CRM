import { type AcceptInvite, acceptInviteSchema } from '@crm/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { DefaultFormLayout } from '@/components/default-form-layout.js';
import { DefaultLoading } from '@/components/default-loading.js';
import { Button } from '@/components/ui/button.js';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form.js';
import { Input } from '@/components/ui/input.js';
import { ItemDescription, ItemTitle } from '@/components/ui/item.js';
import { get, post } from '@/lib/api/client.api.js';
import { t } from '@/lib/helpers/translate.helper.js';

type InvitePeek = { tenantName: string; email: string };
type InviteSearch = { token?: string };

// FND-10/AC1: token via search param (?token=), NUNCA $id/path param — regra
// explícita do design (Tech Decisions). useSearch({strict:false}), não
// Route.useSearch(), para o componente ficar testável isolado do router real.
// Sem <Card asPage> aqui de propósito (routes/_public.tsx), mesma razão de
// AuthPage — tela de pré-autenticação irmã.
export function InvitePage() {
  const { token } = useSearch({ strict: false }) as InviteSearch;
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<string | undefined>();

  const peekQuery = useQuery({
    queryKey: ['invite', 'peek', token],
    queryFn: async (): Promise<InvitePeek> => {
      const res = await get<InvitePeek>(`/invites/${encodeURIComponent(token as string)}`);
      if (!res.success || !res.data) throw new Error(res.message || t('invalid_link'));
      return res.data;
    },
    enabled: Boolean(token),
    retry: false,
  });

  const form = useForm<AcceptInvite>({ resolver: zodResolver(acceptInviteSchema) });

  const onSubmit = async (data: AcceptInvite) => {
    setSubmitError(undefined);
    const res = await post(`/invites/${encodeURIComponent(token as string)}/accept`, data);
    if (!res.success) {
      setSubmitError(res.message || t('action_error'));
      return;
    }
    navigate({ to: '/' });
  };

  return (
    <div className="w-full max-w-sm">
      <ItemTitle className="mb-1 text-lg">{t('accept_invite')}</ItemTitle>
      {!token ? (
        <ItemDescription role="alert">{t('invalid_link')}</ItemDescription>
      ) : peekQuery.isPending ? (
        <DefaultLoading />
      ) : peekQuery.isError ? (
        <ItemDescription role="alert">
          {peekQuery.error instanceof Error ? peekQuery.error.message : t('invalid_link')}
        </ItemDescription>
      ) : (
        <>
          <ItemDescription>
            {t('invite_to')}: {peekQuery.data.tenantName}
          </ItemDescription>
          <ItemDescription>{peekQuery.data.email}</ItemDescription>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="mt-4 flex flex-col gap-4">
              <DefaultFormLayout
                sections={[
                  {
                    title: t('your_data'),
                    description: t('set_name_and_password'),
                    layout: 'vertical',
                    fields: [
                      <FormField
                        key="name"
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('name')}</FormLabel>
                            <FormControl>
                              <Input autoComplete="name" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />,
                      <FormField
                        key="password"
                        control={form.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('password')}</FormLabel>
                            <FormControl>
                              <Input type="password" autoComplete="new-password" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />,
                    ],
                  },
                ]}
              />
              {submitError && <ItemDescription role="alert">{submitError}</ItemDescription>}
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {t('create_account')}
              </Button>
            </form>
          </Form>
        </>
      )}
    </div>
  );
}

export const Route = createFileRoute('/_public/invite/')({
  validateSearch: (search: Record<string, unknown>): InviteSearch => ({
    token: typeof search.token === 'string' ? search.token : undefined,
  }),
  component: InvitePage,
});
