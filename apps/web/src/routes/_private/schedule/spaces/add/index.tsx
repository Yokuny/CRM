import { type CreateSpace, createSpaceSchema } from '@crm/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardHeader } from '@/components/ui/card.js';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form.js';
import { Input } from '@/components/ui/input.js';
import { t } from '@/lib/helpers/translate.helper.js';
import { createSpaceMutation } from '@/query/space.js';

const DEFAULT_VALUES: CreateSpace = { name: '' };

// spec.md SCH-04/SCH-08: react-hook-form + zodResolver contra
// createSpaceSchema (packages/contracts, T11) — mesmo padrão de
// schedule/professionals/add/index.tsx (T34). `active` nasce `default:true`
// no back-end (space.model.ts) — sem campo aqui, o toggle mora só na edição
// (T35/details.tsx).
export function SpaceAddPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const form = useForm<CreateSpace>({ resolver: zodResolver(createSpaceSchema), defaultValues: DEFAULT_VALUES });
  const mutation = useMutation(createSpaceMutation(queryClient));

  // WEB-13-style: guarda contra duplo-clique, mesmo padrão de
  // products/add/index.tsx.
  const onSubmit = (data: CreateSpace) => {
    if (mutation.isPending) return;
    setErrorMessage(null);
    mutation.mutate(data, {
      onSuccess: () => navigate({ to: '/schedule/spaces' }),
      onError: (error: Error) => setErrorMessage(error.message),
    });
  };

  return (
    <Card asPage>
      <CardHeader title={t('space.create.title')} />
      <CardContent>
        <Form {...form}>
          <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="grid gap-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('name')}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {errorMessage && (
              <p role="alert" className="text-destructive text-sm">
                {errorMessage}
              </p>
            )}
            <div>
              <Button type="submit" disabled={mutation.isPending}>
                {t('save')}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute('/_private/schedule/spaces/add/')({
  component: SpaceAddPage,
  staticData: { title: t('space.create.title') },
});
