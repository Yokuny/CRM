import { type UpdateProfessional, updateProfessionalSchema } from '@crm/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import type { Control } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { DefaultEmptyData } from '@/components/default-empty-data.js';
import { DefaultLoading } from '@/components/default-loading.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardHeader } from '@/components/ui/card.js';
import { Checkbox } from '@/components/ui/checkbox.js';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import { t } from '@/lib/helpers/translate.helper.js';
import { type ProfessionalRecord, professionalQuery, updateProfessionalMutation } from '@/query/professional.js';
import { WeeklyScheduleEditor } from './@components/weekly-schedule-editor.js';

// AD-030: `search: { id }`, nunca um `$id` path segment — mesmo padrão de
// products/details.tsx.
export const professionalDetailsSearchSchema = z.object({ id: z.string().min(1) });
export type ProfessionalDetailsSearch = z.infer<typeof professionalDetailsSearchSchema>;

type ProfessionalEditFormProps = { professional: ProfessionalRecord };

// T34 Done when: "edita e desativa" — um único formulário sempre editável
// (sem alternância view/edit, mesmo espírito de ProductEditForm em
// products/details.tsx), validado por updateProfessionalSchema (packages/
// contracts, T10). SCH-05: `active:false` aqui é uma edição de campo normal
// — sem diálogo de confirmação (agendamentos já criados permanecem intactos,
// garantia da camada crm-api, não desta tela).
function ProfessionalEditForm({ professional }: ProfessionalEditFormProps) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const form = useForm<UpdateProfessional>({
    resolver: zodResolver(updateProfessionalSchema),
    defaultValues: {
      name: professional.name,
      slotDurationMinutes: professional.slotDurationMinutes,
      weeklySchedule: professional.weeklySchedule,
      active: professional.active,
    },
  });
  const mutation = useMutation(updateProfessionalMutation(queryClient));

  const onSubmit = (data: UpdateProfessional) => {
    if (mutation.isPending) return;
    setErrorMessage(null);
    mutation.mutate(
      { id: professional.id, data },
      {
        // A mutação já devolve o registro atualizado — re-semeia o form com
        // o valor que o SERVIDOR devolveu (nunca só o que foi digitado),
        // mesmo raciocínio de ProductEditForm em products/details.tsx.
        onSuccess: (updated) => {
          form.reset({
            name: updated.name,
            slotDurationMinutes: updated.slotDurationMinutes,
            weeklySchedule: updated.weeklySchedule,
            active: updated.active,
          });
        },
        onError: (error: Error) => setErrorMessage(error.message),
      },
    );
  };

  return (
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
                  <Input {...field} value={field.value ?? ''} />
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
                    value={field.value ?? 0}
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
          <WeeklyScheduleEditor control={form.control as unknown as Control} name="weeklySchedule" />
        </div>
        <FormField
          control={form.control}
          name="active"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Checkbox
                  label={t('professional.status.active')}
                  checked={field.value ?? true}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
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

// FND-10-style: useSearch({strict:false}) — mesmo motivo já documentado em
// products/details.tsx/customers/details.tsx: o componente fica testável
// isolado do router real.
export function ProfessionalDetailsPage() {
  const search = useSearch({ strict: false }) as ProfessionalDetailsSearch;
  const query = useQuery(professionalQuery(search.id));
  const professional = query.data;

  return (
    <Card asPage>
      <CardHeader title={t('professional.details.title')} />
      <CardContent>
        {query.isLoading ? (
          <DefaultLoading />
        ) : !professional ? (
          // id ausente/inexistente ou de outro tenant (professionalQuery já
          // lança em success:false/404, então isLoading:false + data:undefined
          // cobre os dois casos da mesma forma) — estado explícito de "não
          // encontrado", mesmo padrão de products/details.tsx/customers/details.tsx.
          <DefaultEmptyData />
        ) : (
          <ProfessionalEditForm professional={professional} />
        )}
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute('/_private/schedule/professionals/details')({
  component: ProfessionalDetailsPage,
  staticData: { title: t('professional.details.title') },
  validateSearch: (search: Record<string, unknown>): ProfessionalDetailsSearch =>
    professionalDetailsSearchSchema.parse(search),
});
