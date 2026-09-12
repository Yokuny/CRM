import { type CreateProfessional, createProfessionalSchema } from '@crm/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardHeader } from '@/components/ui/card.js';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import { t } from '@/lib/helpers/translate.helper.js';
import { createProfessionalMutation } from '@/query/professional.js';
import { WeeklyScheduleEditor } from '../@components/weekly-schedule-editor.js';

const DEFAULT_VALUES: CreateProfessional = { name: '', slotDurationMinutes: 30, weeklySchedule: [] };

// spec.md SCH-01/SCH-08: react-hook-form + zodResolver contra
// createProfessionalSchema (packages/contracts, T10) — mesmo padrão de
// routes/_private/products/add/index.tsx. `active` nasce `default:true` no
// back-end (professional.model.ts) — sem campo aqui, o toggle mora só na
// edição (T34/details.tsx, SCH-05).
export function ProfessionalAddPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const form = useForm<CreateProfessional>({
    resolver: zodResolver(createProfessionalSchema),
    defaultValues: DEFAULT_VALUES,
  });
  const mutation = useMutation(createProfessionalMutation(queryClient));

  // WEB-13-style: guarda contra duplo-clique, mesmo padrão de
  // products/add/index.tsx.
  const onSubmit = (data: CreateProfessional) => {
    if (mutation.isPending) return;
    setErrorMessage(null);
    mutation.mutate(data, {
      onSuccess: () => navigate({ to: '/schedule/professionals' }),
      onError: (error: Error) => setErrorMessage(error.message),
    });
  };

  return (
    <Card asPage>
      <CardHeader title={t('professional.create.title')} />
      <CardContent>
        <Form {...form}>
          <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="grid gap-6">
            <div className="grid gap-4 sm:grid-cols-2">
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
              <FormField
                control={form.control}
                name="slotDurationMinutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('professional.slot_duration')}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={5}
                        max={480}
                        step={5}
                        value={field.value}
                        onChange={(e) => field.onChange(e.target.value === '' ? 0 : Number(e.target.value))}
                        onBlur={field.onBlur}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t('professional.weekly_schedule')}</Label>
              <WeeklyScheduleEditor control={form.control} name="weeklySchedule" />
            </div>
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

export const Route = createFileRoute('/_private/schedule/professionals/add/')({
  component: ProfessionalAddPage,
  staticData: { title: t('professional.create.title') },
});
