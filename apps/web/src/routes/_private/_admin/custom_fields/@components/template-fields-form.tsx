import type { FieldDef, FieldTemplateTargetType, MigrationAction, MigrationPlan } from '@crm/contracts';
import { type DestructiveChange, diffFields } from '@crm/field-engine';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { DefaultFormLayout, type FormSection } from '@/components/default-form-layout.js';
import { Button } from '@/components/ui/button.js';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form.js';
import { Input } from '@/components/ui/input.js';
import { t } from '@/lib/helpers/translate.helper.js';
import {
  emptyField,
  isPlanComplete,
  type TemplateForm,
  templateFormSchema,
  toFieldDefs,
  toMigrationPlan,
} from '../@utils/template-form.utils.js';
import { ArrayError } from './array-error.js';
import { FieldEditor } from './field-editor.js';
import { MigrationPlanPanel } from './migration-plan.js';
import { StagesEditor } from './stages-editor.js';

export type TemplateSubmit = { name: string; fields: FieldDef[]; stages?: string[]; migration?: MigrationPlan };

type TemplateFieldsFormProps = {
  targetType: FieldTemplateTargetType;
  defaultValues: TemplateForm;
  // Campos da versão atual (vazio ao criar) — base do diff que decide se o
  // envio precisa de plano de migração.
  originalFields: FieldDef[];
  // Nome só na criação: o bump de versão (bumpFieldTemplateSchema) não
  // aceita renomear o template.
  editableName: boolean;
  isPending: boolean;
  errorMessage: string | null;
  onSubmit: (payload: TemplateSubmit) => void;
  onCancel?: () => void;
};

// Formulário único de criar (tipo de processo novo) e editar (nova versão de
// qualquer template): etapas (só processo) + campos. No envio, compara os
// campos novos com os atuais (diffFields, mesma regra do back-end): mudança
// destrutiva abre o painel de plano de migração, e o envio só segue quando
// toda mudança tem uma escolha.
export function TemplateFieldsForm({
  targetType,
  defaultValues,
  originalFields,
  editableName,
  isPending,
  errorMessage,
  onSubmit,
  onCancel,
}: TemplateFieldsFormProps) {
  const withStages = targetType === 'process';
  const form = useForm<TemplateForm>({ resolver: zodResolver(templateFormSchema(withStages)), defaultValues });
  const { fields, append, remove, move } = useFieldArray({ control: form.control, name: 'fields' });

  const [changes, setChanges] = useState<DestructiveChange[]>([]);
  const [nextFields, setNextFields] = useState<FieldDef[]>([]);
  const [plan, setPlan] = useState<Partial<MigrationPlan>>({});
  const [planIncomplete, setPlanIncomplete] = useState(false);

  const handlePlanChange = (fieldId: string, action: MigrationAction) => {
    setPlan((current) => ({ ...current, [fieldId]: action }));
    setPlanIncomplete(false);
  };

  const onValid = (values: TemplateForm) => {
    if (isPending) return;
    const next = toFieldDefs(values.fields, originalFields);
    const diff = diffFields(originalFields, next);
    const destructive = diff.kind === 'destructive' ? diff.changes : [];
    const alreadyShown = changes.length > 0;
    setChanges(destructive);
    setNextFields(next);

    if (!isPlanComplete(destructive, plan)) {
      // Primeira vez: o painel aparece com a explicação; depois, o aviso.
      setPlanIncomplete(alreadyShown);
      return;
    }

    onSubmit({
      name: values.name.trim(),
      fields: next,
      stages: withStages ? values.stages.map((stage) => stage.value.trim()) : undefined,
      migration: destructive.length > 0 ? toMigrationPlan(destructive, plan) : undefined,
    });
  };

  const sections: FormSection[] = [];
  if (editableName) {
    sections.push({
      title: t('information'),
      description: t('shown_when_opening_process'),
      fields: [
        <FormField
          key="name"
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('name')}</FormLabel>
              <FormControl>
                <Input placeholder={t('example_process_type_name')} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />,
      ],
    });
  }
  if (withStages) {
    sections.push({
      title: t('stages'),
      description: t('process_stages_order'),
      fields: [<StagesEditor key="stages" />],
    });
  }
  sections.push({
    title: t('fields'),
    description: t('extra_fields_configured_by_company'),
    fields: [
      <div key="fields" className="grid gap-3">
        {fields.map((field, index) => (
          <FieldEditor
            key={field.id}
            index={index}
            isFirst={index === 0}
            isLast={index === fields.length - 1}
            onMoveUp={() => move(index, index - 1)}
            onMoveDown={() => move(index, index + 1)}
            onRemove={() => remove(index)}
          />
        ))}
        <ArrayError name="fields" />
        <div>
          <Button type="button" variant="basic" onClick={() => append(emptyField())}>
            {t('add_field')}
          </Button>
        </div>
      </div>,
    ],
  });

  return (
    <Form {...form}>
      <form noValidate onSubmit={form.handleSubmit(onValid)} className="grid gap-6">
        <DefaultFormLayout sections={sections} />
        {changes.length > 0 && (
          <MigrationPlanPanel
            changes={changes}
            originals={originalFields}
            next={nextFields}
            plan={plan}
            onChange={handlePlanChange}
          />
        )}
        {planIncomplete && (
          <p role="alert" className="text-destructive text-sm">
            {t('choose_action_for_each_change')}
          </p>
        )}
        {errorMessage && (
          <p role="alert" className="text-destructive text-sm">
            {errorMessage}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={isPending}>
            {t('save')}
          </Button>
          {onCancel && (
            <Button type="button" variant="basic" onClick={onCancel} disabled={isPending}>
              {t('cancel')}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
