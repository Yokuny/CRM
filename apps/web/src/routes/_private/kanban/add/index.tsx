import { type CreateBoard, createBoardSchema } from '@crm/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { DefaultFormLayout } from '@/components/default-form-layout.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardHeader } from '@/components/ui/card.js';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import { t } from '@/lib/helpers/translate.helper.js';
import { createBoardMutation } from '@/query/board.js';

const DEFAULT_VALUES: CreateBoard = { name: '', description: '', columns: [{ label: '' }] };

// spec.md KAN-01/KAN-02: nome + colunas iniciais (mínimo 1, via
// useFieldArray, mesmo padrão de weekly-schedule-editor.tsx) validados por
// zodResolver(createBoardSchema) — mesmo formato canônico de products/add/
// index.tsx. Remover a última coluna é permitido pela UI (o botão nunca é
// desabilitado): submeter com 0 colunas é bloqueado pelo próprio
// `createBoardSchema.columns.min(1)` ANTES de qualquer chamada à API — a
// mensagem do Zod aparece no FormMessage do array (KAN-02).
export function KanbanAddPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const form = useForm<CreateBoard>({ resolver: zodResolver(createBoardSchema), defaultValues: DEFAULT_VALUES });
  const { fields, append, remove } = useFieldArray({ name: 'columns', control: form.control });
  const mutation = useMutation(createBoardMutation(queryClient));

  // WEB-13-style: guarda contra duplo-clique, mesmo padrão de products/add/index.tsx.
  const onSubmit = (data: CreateBoard) => {
    if (mutation.isPending) return;
    setErrorMessage(null);
    mutation.mutate(data, {
      // Done when: sucesso navega pro board recém-criado.
      onSuccess: (created) => navigate({ to: '/kanban/details', search: { id: created.id } }),
      onError: (error: Error) => setErrorMessage(error.message),
    });
  };

  return (
    <Card asPage>
      <CardHeader title={t('kanban.board.create.title')} />
      <CardContent>
        <Form {...form}>
          <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="grid gap-6">
            <DefaultFormLayout
              sections={[
                {
                  title: t('kanban.board.create.section.info'),
                  description: t('kanban.board.create.section.info_description'),
                  fields: [
                    <FormField
                      key="name"
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('name')}</FormLabel>
                          <FormControl>
                            <Input placeholder={t('kanban.board.create.field.name_placeholder')} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />,
                    <FormField
                      key="description"
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('kanban.board.field.description')}</FormLabel>
                          <FormControl>
                            <Input
                              placeholder={t('kanban.board.field.description_placeholder')}
                              {...field}
                              value={field.value ?? ''}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />,
                  ],
                },
                {
                  title: t('kanban.board.create.section.columns'),
                  description: t('kanban.board.create.section.columns_description'),
                  fields: [
                    <div key="columns" className="grid gap-3 rounded-md border p-3">
                      <div className="flex items-center justify-between">
                        <Label>{t('kanban.board.columns.label')}</Label>
                        <Button type="button" variant="basic" onClick={() => append({ label: '' })}>
                          {t('kanban.board.columns.add')}
                        </Button>
                      </div>
                      {fields.map((field, index) => (
                        <div key={field.id} className="flex items-end gap-2">
                          <FormField
                            control={form.control}
                            name={`columns.${index}.label`}
                            render={({ field: labelField }) => (
                              <FormItem className="flex-1">
                                <FormLabel>{t('kanban.board.columns.column_label')}</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder={t('kanban.board.columns.column_label_placeholder')}
                                    {...labelField}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <Button type="button" variant="basic" onClick={() => remove(index)}>
                            {t('remove')}
                          </Button>
                        </div>
                      ))}
                      {/* Erro de array raiz (KAN-02, "board precisa de ao
                          menos 1 coluna") — react-hook-form 7.44+ guarda o
                          erro de um `useFieldArray` (min/max no nível do
                          array, não de um item) em `errors.columns.root`,
                          não em `errors.columns` direto; Controller/
                          FormField não se aplica bem a esse path
                          (useFieldArray já o registra), então lê-se
                          formState.errors direto — useForm().formState já
                          expõe via Proxy reativo do react-hook-form. */}
                      {(() => {
                        const columnsMessage =
                          form.formState.errors.columns?.root?.message ?? form.formState.errors.columns?.message;
                        return columnsMessage ? (
                          <p className="font-medium text-destructive text-sm">{columnsMessage}</p>
                        ) : null;
                      })()}
                    </div>,
                  ],
                },
              ]}
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

export const Route = createFileRoute('/_private/kanban/add/')({
  component: KanbanAddPage,
  staticData: { title: t('kanban.board.create.title') },
});
