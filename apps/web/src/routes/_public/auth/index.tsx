import { type SignIn, signinSchema } from '@crm/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button.js';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form.js';
import { Input } from '@/components/ui/input.js';
import { ItemDescription, ItemTitle } from '@/components/ui/item.js';
import { post } from '@/lib/api/client.api.js';
import { t } from '@/lib/helpers/translate.helper.js';

// FND-10/AC2, AC4: login redireciona à área privada em caso de sucesso; erro
// do back-end mostra a `message` do ApiResponse, nunca um erro cru. Sem
// <Card asPage> aqui de propósito (routes/_public.tsx) — tela de
// pré-autenticação não tem hierarquia de páginas pra breadcrumb nem um
// "voltar" coerente.
export function AuthPage() {
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const form = useForm<SignIn>({ resolver: zodResolver(signinSchema) });

  const onSubmit = async (data: SignIn) => {
    setErrorMessage(undefined);
    const res = await post('/auth/signin', data);
    if (!res.success) {
      setErrorMessage(res.message || t('auth.signin.error'));
      return;
    }
    navigate({ to: '/' });
  };

  return (
    <div className="w-full max-w-sm">
      <ItemTitle className="mb-1 text-lg">{t('auth.signin.title')}</ItemTitle>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('email')}</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="email" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('password')}</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="current-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {errorMessage && <ItemDescription role="alert">{errorMessage}</ItemDescription>}
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {t('auth.signin.submit')}
          </Button>
        </form>
      </Form>
    </div>
  );
}

export const Route = createFileRoute('/_public/auth/')({
  component: AuthPage,
});
