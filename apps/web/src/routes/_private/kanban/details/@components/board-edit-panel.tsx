import { type UpdateBoard, updateBoardSchema } from '@crm/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { DefaultFormLayout } from '@/components/default-form-layout.js';
import { Button } from '@/components/ui/button.js';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form.js';
import { Input } from '@/components/ui/input.js';
import { t } from '@/lib/helpers/translate.helper.js';
import { type BoardRecord, updateBoardMutation } from '@/query/board.js';

export type BoardEditPanelProps = { board: BoardRecord; onClose: () => void };

// KAN-04: editar nome/descrição de um board — `updateBoardMutation`
// (query/board.ts) já existia (testada em board.unit.test.ts) mas nunca
// tinha UI. Painel INLINE (AD-037), aberto pelo `Editar` do CardHeader —
// padrão view/edit documentado em apps/web/CLAUDE.md, adaptado a esta
// página: a "view" é o próprio board (colunas/cards), então `Editar` abre
// um painel em vez de trocar a página inteira, mas o conceito é o mesmo
// (botão -> form -> Salvar/fechar). Sem cabeçalho próprio (título + "X") —
// o botão `Cancelar` do rodapé já fecha o painel, por instrução explícita
// do usuário; mesmo padrão em block-panel.tsx.
export function BoardEditPanel({ board, onClose }: BoardEditPanelProps) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const form = useForm<UpdateBoard>({
    resolver: zodResolver(updateBoardSchema),
    defaultValues: { name: board.name, description: board.description ?? '' },
  });
  const mutation = useMutation(updateBoardMutation(queryClient));

  const onSubmit = (data: UpdateBoard) => {
    if (mutation.isPending) return;
    setErrorMessage(null);
    mutation.mutate(
      { id: board.id, data },
      {
        onSuccess: onClose,
        onError: (error: Error) => setErrorMessage(error.message || t('kanban.board.edit.error')),
      },
    );
  };

  return (
    <div className="grid gap-4 rounded-md border p-4">
      <Form {...form}>
        <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
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
            ]}
          />
          {errorMessage && (
            <p role="alert" className="text-destructive text-sm">
              {errorMessage}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={mutation.isPending}>
              {t('save')}
            </Button>
            <Button type="button" variant="basic" onClick={onClose} disabled={mutation.isPending}>
              {t('cancel')}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
