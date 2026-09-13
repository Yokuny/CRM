import { type UpdateSchedulingSettings, updateSchedulingSettingsSchema } from '@crm/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { DefaultLoading } from '@/components/default-loading.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardHeader } from '@/components/ui/card.js';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form.js';
import { Input } from '@/components/ui/input.js';
import { t } from '@/lib/helpers/translate.helper.js';
import {
  type SchedulingSettingsRecord,
  schedulingSettingsQuery,
  updateSchedulingSettingsMutation,
} from '@/query/schedulingSettings.js';

type SchedulingSettingsFormProps = { settings: SchedulingSettingsRecord };

// spec.md SCH-06: um único campo (`maxSlotsPerResponse`), validado por
// updateSchedulingSettingsSchema (packages/contracts, T11 — faixa 1..50). O
// input `min`/`max` é só uma dica de UX; a validação de verdade vem do
// zodResolver, mesmo raciocínio de products/details.tsx.
function SchedulingSettingsForm({ settings }: SchedulingSettingsFormProps) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const form = useForm<UpdateSchedulingSettings>({
    resolver: zodResolver(updateSchedulingSettingsSchema),
    defaultValues: { maxSlotsPerResponse: settings.maxSlotsPerResponse },
  });
  const mutation = useMutation(updateSchedulingSettingsMutation(queryClient));

  const onSubmit = (data: UpdateSchedulingSettings) => {
    if (mutation.isPending) return;
    setErrorMessage(null);
    mutation.mutate(data, {
      // A mutação já devolve o registro atualizado — re-semeia o form com o
      // valor que o SERVIDOR devolveu, mesmo raciocínio de
      // schedule/professionals/details.tsx/products/details.tsx.
      onSuccess: (updated) => form.reset({ maxSlotsPerResponse: updated.maxSlotsPerResponse }),
      onError: (error: Error) => setErrorMessage(error.message),
    });
  };

  return (
    <Form {...form}>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="grid gap-6">
        <FormField
          control={form.control}
          name="maxSlotsPerResponse"
          render={({ field }) => (
            <FormItem className="max-w-xs">
              <FormLabel>{t('scheduling_settings.max_slots')}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={50}
                  step={1}
                  value={field.value ?? 0}
                  onChange={(e) => field.onChange(e.target.value === '' ? 0 : Number(e.target.value))}
                  onBlur={field.onBlur}
                />
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
  );
}

// spec.md SCH-06: "quando o tenant nunca configurou, o valor SHALL ser 16" —
// schedulingSettingsQuery (T36) já devolve esse default vindo do back-end
// (schedulingSettings.service.ts), nunca um 404 — sem estado "não
// encontrado" nesta tela, diferente de schedule/professionals/details.tsx.
export function SchedulingSettingsPage() {
  const query = useQuery(schedulingSettingsQuery());

  return (
    <Card asPage>
      <CardHeader title={t('scheduling_settings.title')} />
      <CardContent>
        {query.isLoading || !query.data ? <DefaultLoading /> : <SchedulingSettingsForm settings={query.data} />}
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute('/_private/schedule/settings/')({
  component: SchedulingSettingsPage,
  staticData: { title: t('scheduling_settings.title') },
});
