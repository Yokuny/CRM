import { DEFAULT_CUSTOMER_TEMPLATE_KEY } from '@crm/field-engine';
import type { DragEndEvent } from '@dnd-kit/core';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DefaultLoading } from '@/components/default-loading.js';
import { Card, CardAction, CardContent, CardHeader } from '@/components/ui/card.js';
import { KanbanBoard, KanbanCard, KanbanCards, KanbanHeader, KanbanProvider } from '@/components/ui/kanban.js';
import { patch } from '@/lib/api/client.api.js';
import { t } from '@/lib/helpers/translate.helper.js';
import { type CustomerStatusColumn, customerKeys, customerStatusColumns, customersQuery } from '@/query/customer.js';
import { currentCustomerTemplateQuery } from '@/query/fieldTemplate.js';
import { CustomersViewToggle } from '../@components/view-toggle.js';
import { CustomerKanbanCardContent } from './@components/customer-kanban-card-content.js';

type KanbanItem = { id: string; name: string; phone: string; column: string };

// Mesmo padrão de KanbanBoardView.tsx (referência): "dropped on the column
// itself" (over.id é um column.id de verdade) vs. "dropped on top of another
// card" (over.id é um customer.id — o card carrega a coluna de destino).
const resolveTargetColumn = (
  overId: string,
  columns: CustomerStatusColumn[],
  data: KanbanItem[],
): string | undefined => {
  if (columns.some((column) => column.key === overId)) return overId;
  return data.find((item) => item.id === overId)?.column;
};

export function CustomersKanbanPage() {
  // Move otimista via override local (não escrita direta no cache do
  // TanStack Query): cada coluna é buscada por uma query INDEPENDENTE
  // (customersQuery({status: col.key}), uma por coluna), então a forma mais
  // simples de "mover o card na hora" é sobrepor a coluna exibida por id até
  // a mutação assentar — sucesso invalida as listas (contagens corretas nas
  // duas colunas, WEB-03 AC2); falha limpa o override (o card volta pra
  // coluna de origem, WEB-03 AC3) e mostra um toast de erro.
  const [pendingMoves, setPendingMoves] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();

  const templateQuery = useQuery(currentCustomerTemplateQuery(DEFAULT_CUSTOMER_TEMPLATE_KEY));
  const columns = useMemo(() => customerStatusColumns(templateQuery.data?.fields ?? []), [templateQuery.data]);

  const columnQueries = useQueries({
    queries: columns.map((column) => customersQuery({ status: column.key, limit: 100 })),
  });

  const isLoading = templateQuery.isLoading || columnQueries.some((query) => query.isLoading);

  const data = useMemo<KanbanItem[]>(
    () =>
      columns.flatMap((column, index) => {
        const items = columnQueries[index]?.data?.items ?? [];
        return items.map((customer) => ({
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          column: pendingMoves[customer.id] ?? column.key,
        }));
      }),
    [columns, columnQueries, pendingMoves],
  );

  const mutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await patch(`/customers/${encodeURIComponent(id)}`, { values: { status } });
      if (!res.success) throw new Error(res.message ?? t('kanban.move.error'));
      return res.data;
    },
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const targetColumn = resolveTargetColumn(String(over.id), columns, data);
    if (!targetColumn) return;

    const card = data.find((item) => item.id === active.id);
    if (!card || card.column === targetColumn) return;

    setPendingMoves((prev) => ({ ...prev, [card.id]: targetColumn }));

    mutation.mutate(
      { id: card.id, status: targetColumn },
      {
        // Espera o refetch invalidado assentar ANTES de soltar o override:
        // limpar cedo demais deixaria a coluna cair de volta pro estado
        // "cru" das duas queries por coluna até o refetch chegar — nesse
        // intervalo o card voltaria a aparecer na coluna de origem por um
        // instante, mesmo com a mutação já aceita pelo servidor.
        onSuccess: async () => {
          await queryClient.invalidateQueries({ queryKey: customerKeys.lists() });
          setPendingMoves((prev) => {
            const next = { ...prev };
            delete next[card.id];
            return next;
          });
        },
        onError: () => {
          setPendingMoves((prev) => {
            const next = { ...prev };
            delete next[card.id];
            return next;
          });
          toast.error(t('kanban.move.error'));
        },
      },
    );
  };

  return (
    <Card asPage>
      <CardHeader title={t('customers')}>
        <CardAction>
          <CustomersViewToggle />
        </CardAction>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <DefaultLoading />
        ) : (
          <KanbanProvider
            columns={columns.map((column) => ({ id: column.key, name: column.label, color: column.color }))}
            data={data}
            onDragEnd={handleDragEnd}
          >
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
                </KanbanHeader>
                <KanbanCards id={column.id}>
                  {(item: KanbanItem) => (
                    <KanbanCard key={item.id} id={item.id} name={item.name} column={item.column}>
                      <CustomerKanbanCardContent name={item.name} phone={item.phone} />
                    </KanbanCard>
                  )}
                </KanbanCards>
              </KanbanBoard>
            )}
          </KanbanProvider>
        )}
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute('/_private/customers/kanban/')({
  component: CustomersKanbanPage,
  staticData: { title: t('customers') },
});
