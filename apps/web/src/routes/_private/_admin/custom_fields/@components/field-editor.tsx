import type { FieldDef } from '@crm/contracts';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button.js';
import { Checkbox } from '@/components/ui/checkbox.js';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form.js';
import { Input } from '@/components/ui/input.js';
import { ItemDescription, Panel } from '@/components/ui/item.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { t } from '@/lib/helpers/translate.helper.js';
import {
  DEFAULT_STATUS_COLOR,
  EDITABLE_FIELD_TYPES,
  emptyOption,
  hasOptions,
  isEditableType,
  type TemplateForm,
} from '../@utils/template-form.utils.js';
import { OptionsEditor } from './options-editor.js';

type FieldEditorProps = {
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
};

const TYPE_ITEMS = EDITABLE_FIELD_TYPES.map((type) => ({ value: type, label: t(type) }));

// Uma linha do editor de campos: rótulo, tipo, obrigatoriedade, ordem e a
// config própria do tipo (opções de select/status, texto longo, inteiro...).
export function FieldEditor({ index, isFirst, isLast, onMoveUp, onMoveDown, onRemove }: FieldEditorProps) {
  const { control, getValues, setValue } = useFormContext<TemplateForm>();
  const type = useWatch({ control, name: `fields.${index}.type` });
  const editable = isEditableType(type);
  // Tipo que a tela não edita: o Select mostra só ele, travado.
  const typeItems = editable ? TYPE_ITEMS : [{ value: type, label: t(type) }];

  // Select/status sem opção nenhuma não passa na validação — já entra com
  // uma linha vazia; e toda opção de status precisa de cor.
  const handleTypeChange = (nextType: FieldDef['type']) => {
    setValue(`fields.${index}.type`, nextType, { shouldDirty: true });
    if (!hasOptions(nextType)) return;
    const options = getValues(`fields.${index}.options`);
    setValue(
      `fields.${index}.options`,
      options.length === 0
        ? [emptyOption(nextType)]
        : options.map((option) => ({
            ...option,
            color: nextType === 'status' ? option.color || DEFAULT_STATUS_COLOR : option.color,
          })),
    );
  };

  return (
    <Panel className="grid gap-3" data-testid={`field-editor-${index}`}>
      <div className="flex flex-wrap items-start gap-2">
        <FormField
          control={control}
          name={`fields.${index}.label`}
          render={({ field }) => (
            <FormItem className="min-w-48 flex-1">
              <FormLabel>{t('name')}</FormLabel>
              <FormControl>
                <Input placeholder={t('example_field_name')} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name={`fields.${index}.type`}
          render={({ field }) => (
            <FormItem className="w-44">
              <FormLabel>{t('type')}</FormLabel>
              <Select
                items={typeItems}
                value={field.value}
                disabled={!editable}
                onValueChange={(value) => value && handleTypeChange(value as FieldDef['type'])}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {typeItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
        <div className="flex gap-1 pt-6">
          <Button
            type="button"
            variant="basic"
            size="icon"
            aria-label={t('move_up')}
            title={t('move_up')}
            disabled={isFirst}
            onClick={onMoveUp}
          >
            <ArrowUp />
          </Button>
          <Button
            type="button"
            variant="basic"
            size="icon"
            aria-label={t('move_down')}
            title={t('move_down')}
            disabled={isLast}
            onClick={onMoveDown}
          >
            <ArrowDown />
          </Button>
          <Button
            type="button"
            variant="basic"
            size="icon"
            aria-label={t('remove')}
            title={t('remove')}
            onClick={onRemove}
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <FormField
          control={control}
          name={`fields.${index}.required`}
          render={({ field }) => (
            <Checkbox
              label={t('required')}
              checked={field.value}
              onCheckedChange={(checked) => field.onChange(checked === true)}
            />
          )}
        />
        {type === 'text' && (
          <FormField
            control={control}
            name={`fields.${index}.multiline`}
            render={({ field }) => (
              <Checkbox
                label={t('multiline')}
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked === true)}
              />
            )}
          />
        )}
        {type === 'number' && (
          <FormField
            control={control}
            name={`fields.${index}.integer`}
            render={({ field }) => (
              <Checkbox
                label={t('integer_only')}
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked === true)}
              />
            )}
          />
        )}
        {type === 'select' && (
          <FormField
            control={control}
            name={`fields.${index}.multiple`}
            render={({ field }) => (
              <Checkbox
                label={t('allow_multiple')}
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked === true)}
              />
            )}
          />
        )}
      </div>

      {hasOptions(type) && <OptionsEditor fieldIndex={index} withColor={type === 'status'} />}
      {!editable && <ItemDescription>{t('type_not_editable_here')}</ItemDescription>}
    </Panel>
  );
}
