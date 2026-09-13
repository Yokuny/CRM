import type { DragEndEvent } from '@dnd-kit/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useSearch } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { DefaultEmptyData } from '@/components/default-empty-data.js';
import { DefaultLoading } from '@/components/default-loading.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardHeader } from '@/components/ui/card.js';
import { KanbanBoard, KanbanCard, KanbanCards, KanbanHeader, KanbanProvider } from '@/components/ui/kanban.js';
import { t } from '@/lib/helpers/translate.helper.js';
import { boardCardsQuery, boardQuery, type CardRecord, moveCardMutation } from '@/query/board.js';
import { CardPanel } from './details/@components/card-panel.js';
import { ColumnManagerPanel } from './details/@components/column-manager-panel.js';
import { KanbanCardContent } from './details/@components/kanban-card-content.js';

// AD-030: search:{id}, nunca um `$id` path segment — mesmo padrão de
// appointments/professionals.
export const kanbanDetailsSearchSchema = z.object({ id: z.string().min(1) });
export type KanbanDetailsSearch = z.infer<typeof kanbanDetailsSearchSchema>;

type KanbanItem = CardRecord & { name: string };

type PanelState = { type: 'card'; columnId?: string; card?: CardRecord } | { type: 'columns' } | null;

// FND-10-style: useSearch({strict:false}) — mesmo motivo já documentado em
// products/details.tsx/customers/details.tsx: o componente fica testável
// isolado do router real.
export function KanbanDetailsPage() {
  const search = useSearch({ strict: false }) as KanbanDetailsSearch;
  const queryClient = useQueryClient();
  // Move otimista via override local (não escrita direta no cache) — mesmo
  // padrão de customers/kanban/index.tsx (pendingMoves): só cobre a
  // MUDANÇA DE COLUNA (KAN-18/KAN-20); reordenar dentro da mesma coluna
  // (KAN-19) persiste via moveCardMutation e assenta quando a lista de
  // cards é invalidada, sem override local de posição.
  const [pendingMoves, setPendingMoves] = useState<Record<string, string>>({});
  const [panel, setPanel] = useState<PanelState>(null);

  const boardQueryResult = useQuery(boardQuery(search.id));
  const cardsQueryResult = useQuery(boardCardsQuery(search.id));
  const board = boardQueryResult.data;
  const isLoading = boardQueryResult.isLoading || cardsQueryResult.isLoading;

  const columns = useMemo(
    () =>
      [...(board?.columns ?? [])]
        .sort((a, b) => a.order - b.order)
        .map((column) => ({ id: column.id, name: column.label, color: column.color })),
    [board],
  );

  const data = useMemo<KanbanItem[]>(
    () =>
      (cardsQueryResult.data ?? []).map((card) => ({
        ...card,
        name: card.title,
        column: pendingMoves[card.id] ?? card.column,
      })),
    [cardsQueryResult.data, pendingMoves],
  );

  const moveMutation = useMutation(moveCardMutation(queryClient));

  // KAN-18/19/21: `over.id` é ou o id de uma COLUNA (largou no espaço vazio
  // dela) ou o id de OUTRO card (largou em cima dele, o card carrega a
  // coluna de destino) — mesmo raciocínio de resolveTargetColumn em
  // customers/kanban/index.tsx.
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !board) return;

    const card = data.find((item) => item.id === active.id);
    if (!card) return;

    const overIsColumn = columns.some((column) => column.id === over.id);
    const targetColumn = overIsColumn ? String(over.id) : (data.find((item) => item.id === over.id)?.column ?? null);
    if (!targetColumn) return;

    const columnCards = data.filter((item) => item.column === targetColumn && item.id !== card.id);
    const overIndex = overIsColumn ? columnCards.length : columnCards.findIndex((item) => item.id === over.id);
    const position = overIndex === -1 ? columnCards.length : overIndex;

    if (targetColumn === card.column && position === card.position) return;

    const isCrossColumn = targetColumn !== card.column;
    if (isCrossColumn) setPendingMoves((prev) => ({ ...prev, [card.id]: targetColumn }));

    const clearPending = () => {
      if (!isCrossColumn) return;
      setPendingMoves((prev) => {
        const next = { ...prev };
        delete next[card.id];
        return next;
      });
    };

    moveMutation.mutate(
      { boardId: search.id, cardId: card.id, data: { column: targetColumn, position } },
      {
        // Espera o refetch invalidado assentar ANTES de soltar o override —
        // mesmo cuidado de customers/kanban/index.tsx (limpar cedo demais
        // deixaria o card cair de volta pra coluna de origem por um
        // instante, mesmo já aceito pelo servidor).
        onSuccess: async () => {
          await queryClient.invalidateQueries({ queryKey: boardCardsQuery(search.id).queryKey });
          clearPending();
        },
        onError: () => {
          clearPending();
          toast.error(t('kanban.card.move.error'));
        },
      },
    );
  };

  return (
    <Card asPage>
      <CardHeader title={t('kanban.board.details.title')}>
        {board && (
          <CardAction>
            <Button type="button" variant="basic" size="sm" onClick={() => setPanel({ type: 'columns' })}>
              {t('kanban.column_manager.action')}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="grid gap-4">
        {isLoading ? (
          <DefaultLoading />
        ) : !board ? (
          // id ausente/inexistente ou de outro tenant (boardQuery já lança
          // em success:false/404) — mesmo padrão de products/details.tsx/
          // professionals/details.tsx (KAN-06).
          <DefaultEmptyData />
        ) : (
          <>
            {panel?.type === 'card' && (
              <CardPanel
                boardId={search.id}
                columnId={panel.columnId}
                card={panel.card}
                onClose={() => setPanel(null)}
              />
            )}
            {panel?.type === 'columns' && (
              <ColumnManagerPanel boardId={search.id} columns={board.columns} onClose={() => setPanel(null)} />
            )}
            <KanbanProvider columns={columns} data={data} onDragEnd={handleDragEnd}>
              {(column) => (
                <KanbanBoard id={column.id} key={column.id}>
                  <KanbanHeader>
                    <div className="flex min-w-0 items-center gap-2">
                      {typeof column.color === 'string' && (
                        <span
                          aria-hidden
                          className="inline-block size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: column.color }}
                        />
                      )}
                      <span className="truncate font-medium">{column.name}</span>
                      <span className="shrink-0 font-normal text-muted-foreground tabular-nums">
                        ({data.filter((item) => item.column === column.id).length})
                      </span>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="basic"
                      aria-label={`${t('add')} ${column.name}`}
                      onClick={() => setPanel({ type: 'card', columnId: column.id })}
                    >
                      {t('add')}
                    </Button>
                  </KanbanHeader>
                  <KanbanCards id={column.id}>
                    {(item: KanbanItem) => (
                      <KanbanCard key={item.id} id={item.id} name={item.name} column={item.column}>
                        <KanbanCardContent
                          title={item.title}
                          description={item.description}
                          customerName={item.customerName}
                          processStage={item.processStage}
                          processTemplateName={item.processTemplateName}
                          orderTotalPrice={item.orderTotalPrice}
                          orderStatus={item.orderStatus}
                          assigneeName={item.assigneeName}
                          actions={
                            // onPointerDown+stopPropagation: o clique não pode
                            // ser interpretado como início de um drag —
                            // KanbanCard aplica os listeners de arraste no
                            // wrapper inteiro do card (mesmo cuidado de
                            // customers/kanban/index.tsx).
                            <button
                              type="button"
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={() => setPanel({ type: 'card', card: item })}
                              className="w-fit text-primary text-xs underline underline-offset-4"
                            >
                              {t('edit')}
                            </button>
                          }
                        />
                      </KanbanCard>
                    )}
                  </KanbanCards>
                </KanbanBoard>
              )}
            </KanbanProvider>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute('/_private/kanban/details')({
  component: KanbanDetailsPage,
  staticData: { title: t('kanban.board.details.title') },
  validateSearch: (search: Record<string, unknown>): KanbanDetailsSearch => kanbanDetailsSearchSchema.parse(search),
});
