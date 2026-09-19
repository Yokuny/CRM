import { Trash2 } from 'lucide-react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { Button } from '@/components/ui/button.js';
import { FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import { t } from '@/lib/helpers/translate.helper.js';
import { emptyOption, type TemplateForm } from '../@utils/template-form.utils.js';
import { ArrayError } from './array-error.js';

type OptionsEditorProps = { fieldIndex: number; withColor: boolean };

// Opções de um campo `select` (só rótulo) ou `status` (rótulo + cor). A
// chave de cada opção nova sai do rótulo no envio (toFieldDefs); opção
// existente mantém a chave — renomear nunca é destrutivo, remover é.
export function OptionsEditor({ fieldIndex, withColor }: OptionsEditorProps) {
  const { control } = useFormContext<TemplateForm>();
  const name = `fields.${fieldIndex}.options` as const;
  const { fields, append, remove } = useFieldArray({ control, name });

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <Label>{t('options')}</Label>
        <Button
          type="button"
          variant="basic"
          size="sm"
          onClick={() => append(emptyOption(withColor ? 'status' : 'select'))}
        >
          {t('add_option')}
        </Button>
      </div>
      {fields.map((option, index) => (
        <div key={option.id} className="flex items-start gap-2">
          {withColor && (
            <FormField
              control={control}
              name={`${name}.${index}.color`}
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input type="color" aria-label={t('color')} className="w-10 px-1" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
          )}
          <FormField
            control={control}
            name={`${name}.${index}.label`}
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormControl>
                  <Input aria-label={t('name')} placeholder={t('example_option_name')} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
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
      <ArrayError name={name} />
    </div>
  );
}
