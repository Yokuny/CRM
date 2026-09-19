import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { Button } from '@/components/ui/button.js';
import { FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form.js';
import { Input } from '@/components/ui/input.js';
import { Panel } from '@/components/ui/item.js';
import { t } from '@/lib/helpers/translate.helper.js';
import type { TemplateForm } from '../@utils/template-form.utils.js';
import { ArrayError } from './array-error.js';

// Etapas de um tipo de processo, na ordem em que o processo passa por elas.
export function StagesEditor() {
  const { control } = useFormContext<TemplateForm>();
  const { fields, append, remove, move } = useFieldArray({ control, name: 'stages' });

  return (
    <Panel className="grid gap-2">
      {fields.map((stage, index) => (
        <div key={stage.id} className="flex items-start gap-2">
          <FormField
            control={control}
            name={`stages.${index}.value`}
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormControl>
                  <Input aria-label={t('stage')} placeholder={t('example_stage_name')} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button
            type="button"
            variant="basic"
            size="icon"
            aria-label={t('move_up')}
            title={t('move_up')}
            disabled={index === 0}
            onClick={() => move(index, index - 1)}
          >
            <ArrowUp />
          </Button>
          <Button
            type="button"
            variant="basic"
            size="icon"
            aria-label={t('move_down')}
            title={t('move_down')}
            disabled={index === fields.length - 1}
            onClick={() => move(index, index + 1)}
          >
            <ArrowDown />
          </Button>
          <Button
            type="button"
            variant="basic"
            size="icon"
            aria-label={t('remove')}
            title={t('remove')}
            onClick={() => remove(index)}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <ArrayError name="stages" />
      <div>
        <Button type="button" variant="basic" onClick={() => append({ value: '' })}>
          {t('add_stage')}
        </Button>
      </div>
    </Panel>
  );
}
