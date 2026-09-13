import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, X as IconClose } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
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
      <Button type="button" variant="basic" size="sm" onClick={onClose} aria-label={t('close')}>
        <IconClose className="size-4" />
      </Button>
    </div>
  );
}

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

// KAN-08/KAN-29: renomear e/ou definir cor de UMA coluna — estado local por
// linha (não react-hook-form: cada coluna é uma unidade independente, sem
// validação cruzada entre campos que justifique um form inteiro).
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
  const [label, setLabel] = useState(column.label);
  const [color, setColor] = useState(column.color ?? '');
  const labelId = useId();
  const colorId = useId();

  const updateMutation = useMutation(updateColumnMutation(queryClient));
  const removeMutation = useMutation(removeColumnMutation(queryClient));

  const handleSave = () => {
    if (updateMutation.isPending) return;
    updateMutation.mutate(
      { boardId, columnId: column.id, data: { label: label.trim(), color: color.trim() || undefined } },
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
    <div className="grid gap-2 rounded-md border p-3">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Label htmlFor={labelId}>{t('kanban.board.columns.column_label')}</Label>
          <Input id={labelId} value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div className="w-28">
          <Label htmlFor={colorId}>{t('kanban.column.field.color')}</Label>
          <Input id={colorId} value={color} onChange={(e) => setColor(e.target.value)} placeholder="#RRGGBB" />
        </div>
        <Button type="button" size="sm" disabled={updateMutation.isPending} onClick={handleSave}>
          {t('save')}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="basic"
          size="sm"
          aria-label={t('kanban.column_manager.move_up')}
          disabled={!canMoveUp || reorderPending}
          onClick={onMoveUp}
        >
          <ChevronUp className="size-4" />
        </Button>
        <Button
          type="button"
          variant="basic"
          size="sm"
          aria-label={t('kanban.column_manager.move_down')}
          disabled={!canMoveDown || reorderPending}
          onClick={onMoveDown}
        >
          <ChevronDown className="size-4" />
        </Button>
        <Button type="button" variant="basic" size="sm" disabled={!canRemove} onClick={handleRemove}>
          {t('remove')}
        </Button>
      </div>
    </div>
  );
}

// design.md/T19: painel INLINE, nunca um Dialog modal (AD-037) — mesmo
// formato de appointment-panel.tsx/block-panel.tsx/card-panel.tsx. Reordenar
// via botões subir/descer (não drag-and-drop): context.md deixa o widget
// exato a critério do Design, e nested DnD contexts dentro do
// KanbanProvider/DndContext do board (T20, `components/ui/kanban.tsx`)
// adicionaria complexidade não pedida por nenhuma AC do spec.
export function ColumnManagerPanel({ onClose, boardId, columns }: ColumnManagerPanelProps) {
  const queryClient = useQueryClient();
  const addMutation = useMutation(addColumnMutation(queryClient));
  const reorderMutation = useMutation(reorderColumnsMutation(queryClient));
  const [newLabel, setNewLabel] = useState('');
  const newLabelId = useId();

  const sorted = [...columns].sort((a, b) => a.order - b.order);

  // KAN-07: nova coluna sempre ao final da ordem atual (o backend já garante
  // isso, board.repository.addColumn) — este painel só envia o label.
  const handleAdd = () => {
    const label = newLabel.trim();
    if (!label || addMutation.isPending) return;
    addMutation.mutate(
      { boardId, data: { label } },
      { onSuccess: () => setNewLabel(''), onError: (error: Error) => toast.error(error.message) },
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
      <div className="grid gap-2">
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
      </div>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Label htmlFor={newLabelId}>{t('kanban.board.columns.column_label')}</Label>
          <Input id={newLabelId} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
        </div>
        <Button type="button" size="sm" disabled={addMutation.isPending} onClick={handleAdd}>
          {t('kanban.board.columns.add')}
        </Button>
      </div>
    </div>
  );
}
