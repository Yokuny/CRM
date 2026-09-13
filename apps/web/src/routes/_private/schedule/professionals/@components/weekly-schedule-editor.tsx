import type { Control } from 'react-hook-form';
import { useFieldArray, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button.js';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import { t } from '@/lib/helpers/translate.helper.js';

export type WeeklyScheduleEditorProps = {
  // `Control` (= `Control<FieldValues>`), mesmo padrão de DynamicFieldArray
  // (dynamic-field.array.tsx) — um sub-componente reutilizável entre
  // formulários com generics CONCRETOS diferentes (`useForm<CreateProfessional>`
  // em add/index.tsx, `useForm<UpdateProfessional>` em details.tsx) não
  // consegue expor um `Control<T>` tipado ao shape exato de cada um sem
  // reescrever o componente como genérico — cada CHAMADOR faz o cast
  // (`control as unknown as Control`) na própria borda, deixando este
  // componente limpo por dentro.
  control: Control;
  name: string;
};

// spec.md SCH-01: 0..6 (domingo..sábado) — mesma faixa de scheduleWindowSchema
// (packages/contracts, T10).
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

type ScheduleWindowValue = { weekday: number; start: string; end: string };

// SCH-02/SCH-03: editor controlado de `weeklySchedule` (react-hook-form,
// mesmo padrão de useFieldArray de dynamic-field.array.tsx), agrupado por
// weekday pra legibilidade — cada grupo é fixo ao seu dia (o weekday é
// gravado só no momento do "Adicionar", nunca editável depois, então não há
// input pra ele). `useWatch` (e não só `fields` de useFieldArray) porque
// `fields` reflete apenas a ESTRUTURA do array (ordem/inserção/remoção); os
// VALORES atuais de weekday/start/end de cada item só chegam via watch —
// sem isso, agrupar por weekday usaria o valor do momento em que o item foi
// criado, nunca o atual.
export function WeeklyScheduleEditor({ control, name }: WeeklyScheduleEditorProps) {
  const { fields, append, remove } = useFieldArray({ name, control });
  const watched = useWatch({ control, name }) as ScheduleWindowValue[] | undefined;

  const windows = fields.map((field, index) => {
    const current = watched?.[index];
    return {
      id: field.id,
      index,
      weekday: current?.weekday ?? (field as unknown as ScheduleWindowValue).weekday ?? 0,
    };
  });

  const handleAdd = (weekday: number) => append({ weekday, start: '', end: '' });

  return (
    <div className="grid gap-4">
      {WEEKDAYS.map((weekday) => {
        const windowsForDay = windows.filter((item) => item.weekday === weekday);
        return (
          <div
            key={weekday}
            data-testid={`weekly-schedule-weekday-${weekday}`}
            className="grid gap-3 rounded-md border p-3"
          >
            <div className="flex items-center justify-between">
              <Label>{t(`weekday.${weekday}`)}</Label>
              <Button type="button" variant="basic" size="sm" onClick={() => handleAdd(weekday)}>
                {t('add')}
              </Button>
            </div>
            {windowsForDay.map((item) => (
              <div key={item.id} className="flex items-end gap-2">
                <FormField
                  control={control}
                  name={`${name}.${item.index}.start`}
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel>{t('schedule.window.start')}</FormLabel>
                      <FormControl>
                        {/* `value={field.value ?? ''}` (não só `{...field}`): um item
                            recém-adicionado via `append` pode renderizar uma primeira
                            passada com `field.value` ainda `undefined` antes do
                            react-hook-form assentar o array — sem a guarda, o React
                            avisa "uncontrolled to controlled" nessa transição. */}
                        <Input type="time" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name={`${name}.${item.index}.end`}
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel>{t('schedule.window.end')}</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="button" variant="basic" size="sm" onClick={() => remove(item.index)}>
                  {t('remove')}
                </Button>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
