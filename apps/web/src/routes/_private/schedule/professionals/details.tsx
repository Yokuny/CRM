import { type UpdateProfessional, updateProfessionalSchema } from '@crm/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import type { Control } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { DefaultEmptyData } from '@/components/default-empty-data.js';
import { DefaultFormLayout } from '@/components/default-form-layout.js';
import { DefaultLoading } from '@/components/default-loading.js';
import { BadgeIndicator } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardHeader } from '@/components/ui/card.js';
import { Checkbox } from '@/components/ui/checkbox.js';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form.js';
import { Input } from '@/components/ui/input.js';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item.js';
import { t } from '@/lib/helpers/translate.helper.js';
import {
  type ProfessionalRecord,
  professionalKeys,
  professionalQuery,
  updateProfessionalMutation,
} from '@/query/professional.js';
import { WeeklyScheduleEditor } from './@components/weekly-schedule-editor.js';

// SCH-02/SCH-03: mesmo agrupamento por weekday de weekly-schedule-editor.tsx,
// só que em modo leitura — usado pela view do padrão view/edit (CLAUDE.md).
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

function WeeklyScheduleSummary({ weeklySchedule }: { weeklySchedule: ProfessionalRecord['weeklySchedule'] }) {
  const days = WEEKDAYS.map((weekday) => ({
    weekday,
    windows: weeklySchedule.filter((window) => window.weekday === weekday),
  })).filter((day) => day.windows.length > 0);

  if (days.length === 0) return <ItemDescription>-</ItemDescription>;

  return (
    <div className="grid gap-1">
      {days.map((day) => (
        <ItemDescription key={day.weekday}>
          {t(`weekday.${day.weekday}`)}: {day.windows.map((window) => `${window.start}–${window.end}`).join(', ')}
        </ItemDescription>
      ))}
    </div>
  );
}

// AD-030: `search: { id }`, nunca um `$id` path segment — mesmo padrão de
// products/details.tsx.
export const professionalDetailsSearchSchema = z.object({ id: z.string().min(1) });
export type ProfessionalDetailsSearch = z.infer<typeof professionalDetailsSearchSchema>;

type ProfessionalDetailsViewProps = { professional: ProfessionalRecord };

// Padrão view/edit documentado em apps/web/CLAUDE.md ("Detalhe de entidade").
function ProfessionalDetailsView({ professional }: ProfessionalDetailsViewProps) {
  return (
    <ItemGroup>
      <Item>
        <ItemContent>
          <ItemTitle>{t('name')}</ItemTitle>
          <ItemDescription>{professional.name}</ItemDescription>
        </ItemContent>
      </Item>
      <Item>
        <ItemContent>
          <ItemTitle>{t('professional.slot_duration')}</ItemTitle>
          <ItemDescription>{professional.slotDurationMinutes}</ItemDescription>
        </ItemContent>
      </Item>
      <Item>
        <ItemContent>
          <ItemTitle>{t('professional.weekly_schedule')}</ItemTitle>
          <WeeklyScheduleSummary weeklySchedule={professional.weeklySchedule} />
        </ItemContent>
      </Item>
      <Item>
        <ItemContent>
          <ItemTitle>{t('status')}</ItemTitle>
          <ItemDescription>
            <BadgeIndicator variant={professional.active ? 'active' : 'neutral'}>
              {t(professional.active ? 'professional.status.active' : 'professional.status.inactive')}
            </BadgeIndicator>
          </ItemDescription>
        </ItemContent>
      </Item>
    </ItemGroup>
  );
}

type ProfessionalEditFormProps = { professional: ProfessionalRecord; onSaved: () => void; onCancel: () => void };

// Padrão view/edit (apps/web/CLAUDE.md), validado por updateProfessionalSchema
// (packages/contracts, T10). SCH-05: `active:false` aqui é uma edição de
// campo normal — sem diálogo de confirmação (agendamentos já criados
// permanecem intactos, garantia da camada crm-api, não desta tela).
function ProfessionalEditForm({ professional, onSaved, onCancel }: ProfessionalEditFormProps) {
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
        // Escreve a resposta do SERVIDOR direto no cache de detalhe — mesmo
        // raciocínio de CustomerEditForm em customers/details.tsx, evita um
        // GET extra e qualquer flash de dado desatualizado ao voltar pro
        // modo leitura (a invalidação da mutação, query/professional.ts,
        // ainda cobre a lista).
        onSuccess: (updated) => {
          queryClient.setQueryData(professionalKeys.detail(professional.id), updated);
          onSaved();
        },
        onError: (error: Error) => setErrorMessage(error.message),
      },
    );
  };

  return (
    <Form {...form}>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="grid gap-6">
        <DefaultFormLayout
          sections={[
            {
              title: t('professional.create.section.info'),
              description: t('professional.create.section.info_description'),
              fields: [
                <div key="professional-fields" className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('name')}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t('professional.create.field.name_placeholder')}
                            {...field}
                            value={field.value ?? ''}
                          />
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
                            placeholder={t('professional.slot_duration_placeholder')}
                            value={field.value ?? 0}
                            onChange={(e) => field.onChange(e.target.value === '' ? 0 : Number(e.target.value))}
                            onBlur={field.onBlur}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>,
                <FormField
                  key="active"
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
                />,
              ],
            },
            {
              title: t('professional.create.section.schedule'),
              description: t('professional.create.section.schedule_description'),
              fields: [
                <WeeklyScheduleEditor
                  key="weeklySchedule"
                  control={form.control as unknown as Control}
                  name="weeklySchedule"
                />,
              ],
            },
          ]}
        />
        {errorMessage && (
          <p role="alert" className="text-destructive text-sm">
            {errorMessage}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={mutation.isPending}>
            {t('save')}
          </Button>
          <Button type="button" variant="basic" onClick={onCancel} disabled={mutation.isPending}>
            {t('cancel')}
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
  const [isEditing, setIsEditing] = useState(false);
  const query = useQuery(professionalQuery(search.id));
  const professional = query.data;

  return (
    <Card asPage>
      <CardHeader title={t('professional.details.title')}>
        {professional && !isEditing && (
          <CardAction>
            <Button variant="basic" onClick={() => setIsEditing(true)}>
              {t('edit')}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <DefaultLoading />
        ) : !professional ? (
          // id ausente/inexistente ou de outro tenant (professionalQuery já
          // lança em success:false/404, então isLoading:false + data:undefined
          // cobre os dois casos da mesma forma) — estado explícito de "não
          // encontrado", mesmo padrão de products/details.tsx/customers/details.tsx.
          <DefaultEmptyData />
        ) : isEditing ? (
          <ProfessionalEditForm
            professional={professional}
            onSaved={() => setIsEditing(false)}
            onCancel={() => setIsEditing(false)}
          />
        ) : (
          <ProfessionalDetailsView professional={professional} />
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
