import { type SignIn, signinSchema } from '@crm/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { createRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Card, CardContent, CardHeader } from '../../../components/ui/card.js';
import { post } from '../../../lib/api/client.api.js';
import { t } from '../../../lib/helpers/translate.helper.js';
import { Route as rootRoute } from '../../__root.js';

// FND-10/AC2, AC4: login redireciona à área privada em caso de sucesso; erro
// do back-end mostra a `message` do ApiResponse, nunca um erro cru.
export function AuthPage() {
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignIn>({ resolver: zodResolver(signinSchema) });

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
    <Card asPage>
      <CardHeader title={t('auth.signin.title')} />
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <label htmlFor="email">{t('email')}</label>
          <input id="email" type="email" autoComplete="email" {...register('email')} />
          {errors.email && <span role="alert">{errors.email.message}</span>}

          <label htmlFor="password">{t('password')}</label>
          <input id="password" type="password" autoComplete="current-password" {...register('password')} />
          {errors.password && <span role="alert">{errors.password.message}</span>}

          {errorMessage && <p role="alert">{errorMessage}</p>}

          <button type="submit" disabled={isSubmitting}>
            {t('auth.signin.submit')}
          </button>
        </form>
      </CardContent>
    </Card>
  );
}

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth',
  component: AuthPage,
});
