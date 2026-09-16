import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, X as IconClose } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { DefaultFormLayout } from '@/components/default-form-layout.js';
import { Button } from '@/components/ui/button.js';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form.js';
import { Input } from '@/components/ui/input.js';
import { t } from '@/lib/helpers/translate.helper.js';
import {
  addColumnMutation,
  type BoardColumnRecord,
  removeColumnMutation,
  reorderColumnsMutation,
  updateColumnMutation,
} from '@/query/board.js';

export type ColumnManagerPanelProps = {
  onClose: () => void;
  boardId: string;
  columns: BoardColumnRecord[];
};

// Mesmo PanelHeader de appointment-panel.tsx/block-panel.tsx/card-panel.tsx
// (cada painel AD-037 tem sua própria cópia — nenhum deles compartilha esse
// pedaço hoje, mesmo estilo já em uso).
function PanelHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="flex w-fit items-center gap-2 font-medium font-mono text-sm leading-snug">{title}</h2>
      <Button type="button" variant="basic" onClick={onClose} aria-label={t('close')}>
        <IconClose className="size-4" />
      </Button>
    </div>
  );
}

type ColumnRowFormValues = { label: string; color: string };

type ColumnRowProps = {
  boardId: string;
  column: BoardColumnRecord;
  canRemove: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  reorderPending: boolean;
};

// KAN-08/KAN-29: renomear e/ou definir cor de UMA coluna — mesmo padrão
// Form/FormField/react-hook-form do resto do sistema (apps/web/CLAUDE.md,
// "Formulário"), um `useForm` próprio por linha (cada coluna é uma unidade
// independente, sem validação cruzada entre campos que justifique um form
// só pro board inteiro). Sem `zodResolver(updateColumnSchema)` de propósito:
// o schema exige `color` no formato hex QUANDO presente, mas o campo vazio
// (`''`, nunca tocado) precisa continuar submetendo como `undefined` sem
// bloquear o submit — a conversão abaixo (`trim() || undefined`) já cobre
// isso antes de chamar a mutation, e o back-end (mesmo schema) valida de
// verdade.
function ColumnRow({
  boardId,
  column,
  canRemove,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  reorderPending,
}: ColumnRowProps) {
  const queryClient = useQueryClient();
  const form = useForm<ColumnRowFormValues>({ defaultValues: { label: column.label, color: column.color ?? '' } });

  const updateMutation = useMutation(updateColumnMutation(queryClient));
  const removeMutation = useMutation(removeColumnMutation(queryClient));

  const onSubmit = (values: ColumnRowFormValues) => {
    if (updateMutation.isPending) return;
    updateMutation.mutate(
      { boardId, columnId: column.id, data: { label: values.label.trim(), color: values.color.trim() || undefined } },
      { onError: (error: Error) => toast.error(error.message) },
    );
  };

  // KAN-10/KAN-11: o backend rejeita (400) tanto a última coluna restante
  // quanto uma coluna com card(s) — a UI só desabilita o caso barato de
  // checar (última coluna, `canRemove`); o caso "tem card(s)" é sempre
  // tentado e o erro do backend vira toast, sem quebrar a tela.
  const handleRemove = () => {
    if (!canRemove || removeMutation.isPending) return;
    removeMutation.mutate({ boardId, columnId: column.id }, { onError: (error: Error) => toast.error(error.message) });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-2 rounded-md border p-3">
        <div className="flex items-end gap-2">
          <FormField
            control={form.control}
            name="label"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel>{t('kanban.board.columns.column_label')}</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="color"
            render={({ field }) => (
              <FormItem className="w-28">
                <FormLabel>{t('kanban.column.field.color')}</FormLabel>
                <FormControl>
                  <Input placeholder="#RRGGBB" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" disabled={updateMutation.isPending}>
            {t('save')}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="basic"
            aria-label={t('kanban.column_manager.move_up')}
            disabled={!canMoveUp || reorderPending}
            onClick={onMoveUp}
          >
            <ChevronUp className="size-4" />
          </Button>
          <Button
            type="button"
            variant="basic"
            aria-label={t('kanban.column_manager.move_down')}
            disabled={!canMoveDown || reorderPending}
            onClick={onMoveDown}
          >
            <ChevronDown className="size-4" />
          </Button>
          <Button type="button" variant="basic" disabled={!canRemove} onClick={handleRemove}>
            {t('remove')}
          </Button>
        </div>
      </form>
    </Form>
  );
}

type NewColumnFormValues = { label: string };

// design.md/T19: painel INLINE, nunca um Dialog modal (AD-037) — mesmo
// formato de appointment-panel.tsx/block-panel.tsx/card-panel.tsx. Reordenar
// via botões subir/descer (não drag-and-drop): context.md deixa o widget
// exato a critério do Design, e nested DnD contexts dentro do
// KanbanProvider/DndContext do board (T20, `components/ui/kanban.tsx`)
// adicionaria complexidade não pedida por nenhuma AC do spec. Padrão
// view/edit (apps/web/CLAUDE.md): `DefaultFormLayout` agrupa a lista de
// colunas + o form de "nova coluna" numa única seção — um título por
// COLUNA (ColumnRow) ficaria repetitivo, então a seção é uma só pro painel
// inteiro, não uma por form aninhado.
export function ColumnManagerPanel({ onClose, boardId, columns }: ColumnManagerPanelProps) {
  const queryClient = useQueryClient();
  const addMutation = useMutation(addColumnMutation(queryClient));
  const reorderMutation = useMutation(reorderColumnsMutation(queryClient));
  const addForm = useForm<NewColumnFormValues>({ defaultValues: { label: '' } });

  const sorted = [...columns].sort((a, b) => a.order - b.order);

  // KAN-07: nova coluna sempre ao final da ordem atual (o backend já garante
  // isso, board.repository.addColumn) — este painel só envia o label.
  const handleAdd = (values: NewColumnFormValues) => {
    const label = values.label.trim();
    if (!label || addMutation.isPending) return;
    addMutation.mutate(
      { boardId, data: { label } },
      { onSuccess: () => addForm.reset({ label: '' }), onError: (error: Error) => toast.error(error.message) },
    );
  };

  // KAN-09: reordena via reorderColumnsMutation — envia o array COMPLETO de
  // ids na nova ordem desejada.
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= sorted.length || reorderMutation.isPending) return;
    const reordered = [...sorted];
    const [item] = reordered.splice(index, 1);
    reordered.splice(target, 0, item as BoardColumnRecord);
    reorderMutation.mutate(
      { boardId, columnIds: reordered.map((c) => c.id) },
      { onError: (error: Error) => toast.error(error.message) },
    );
  };

  return (
    <div className="grid gap-4 rounded-md border p-4">
      <PanelHeader title={t('kanban.column_manager.title')} onClose={onClose} />
      <DefaultFormLayout
        sections={[
          {
            title: t('kanban.column_manager.section_title'),
            description: t('kanban.column_manager.section_description'),
            layout: 'vertical',
            fields: [
              <div key="columns" className="grid gap-2">
                {sorted.map((column, index) => (
                  <ColumnRow
                    key={column.id}
                    boardId={boardId}
                    column={column}
                    // KAN-11: a última coluna restante nunca pode ser removida, mesmo vazia.
                    canRemove={sorted.length > 1}
                    canMoveUp={index > 0}
                    canMoveDown={index < sorted.length - 1}
                    onMoveUp={() => move(index, -1)}
                    onMoveDown={() => move(index, 1)}
                    reorderPending={reorderMutation.isPending}
                  />
                ))}
              </div>,
              <Form key="add-column" {...addForm}>
                <form onSubmit={addForm.handleSubmit(handleAdd)} className="flex items-end gap-2">
                  <FormField
                    control={addForm.control}
                    name="label"
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormLabel>{t('kanban.board.columns.column_label')}</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" disabled={addMutation.isPending}>
                    {t('kanban.board.columns.add')}
                  </Button>
                </form>
              </Form>,
            ],
          },
        ]}
      />
    </div>
  );
}
