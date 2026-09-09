import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router';
import type { ColumnDef, OnChangeFn, PaginationState, SortingState } from '@tanstack/react-table';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { DefaultEmptyData } from '@/components/default-empty-data.js';
import { DefaultLoading } from '@/components/default-loading.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardHeader } from '@/components/ui/card.js';
import { DataTable } from '@/components/ui/data-table.js';
import { formatMoney } from '@/lib/helpers/money.helper.js';
import { t } from '@/lib/helpers/translate.helper.js';
import {
  approveOrderMutation,
  type OrderRecord,
  type OrderStatus,
  ordersQuery,
  rejectOrderMutation,
} from '@/query/order.js';

// spec.md P1 "Operador aprova ou rejeita um pedido pendente"/AC1/AC2:
// filtro por status via search (AD-030), default 'pending_approval' — a
// MESMA tela também serve de histórico quando filtrada para
// confirmed/rejected (context.md decisão 5: uma única tela simples, sem
// design rico neste P1, em vez de uma segunda tela). `conversation` é o
// mesmo workaround de assignee em conversation-queue.tsx: <DataTable> exige
// uma busca textual, e o único filtro textual que o back-end de Order de
// fato aceita (order.router.ts) é `conversation`.
export const ordersSearchSchema = z.object({
  status: z.enum(['pending_approval', 'confirmed', 'rejected']).optional().default('pending_approval'),
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).optional().default(20),
  conversation: z.string().optional().default(''),
});
export type OrdersSearch = z.infer<typeof ordersSearchSchema>;

const STATUS_FILTERS: { value: OrderStatus; label: string }[] = [
  { value: 'pending_approval', label: t('order.status.pending_approval') },
  { value: 'confirmed', label: t('order.status.confirmed') },
  { value: 'rejected', label: t('order.status.rejected') },
];

const STATUS_BADGE_VARIANT: Record<OrderStatus, 'warning' | 'success' | 'error'> = {
  pending_approval: 'warning',
  confirmed: 'success',
  rejected: 'error',
};

// design.md/T23: sem hub — index.tsx é a própria listagem (Pedidos só tem
// esta tela, ao contrário de Customer). useSearch({strict:false}): mesmo
// motivo já documentado em products/index.tsx — o componente fica testável
// isolado do router real.
export function OrdersIndexPage() {
  const search = useSearch({ strict: false }) as OrdersSearch;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const query = useQuery(
    ordersQuery({
      status: search.status,
      conversation: search.conversation || undefined,
      page: search.page,
      limit: search.limit,
    }),
  );

  const approveMutation = useMutation(approveOrderMutation(queryClient));
  const rejectMutation = useMutation(rejectOrderMutation(queryClient));

  const handleApprove = (id: string) => {
    approveMutation.mutate({ id }, { onError: (error) => toast.error(error.message) });
  };
  const handleReject = (id: string) => {
    rejectMutation.mutate({ id }, { onError: (error) => toast.error(error.message) });
  };

  const pageCount = Math.max(1, Math.ceil((query.data?.total ?? 0) / search.limit));

  const tableState = useMemo(
    () => ({ pagination: { pageIndex: search.page - 1, pageSize: search.limit }, sorting: [] as SortingState }),
    [search.page, search.limit],
  );

  // AD-028: nunca re-busca a coleção inteira — só navega com um novo search
  // param, ordersQuery (T22) refaz a chamada ao servidor com os parâmetros
  // corretos. `as any`: mesmo workaround já usado em products/index.tsx
  // (limitação conhecida desta versão do TanStack Router).
  const handlePaginationChange: OnChangeFn<PaginationState> = (updater) => {
    const current: PaginationState = { pageIndex: search.page - 1, pageSize: search.limit };
    const next = typeof updater === 'function' ? updater(current) : updater;
    navigate({
      search: ((prev: OrdersSearch) => ({ ...prev, page: next.pageIndex + 1, limit: next.pageSize })) as any,
      replace: true,
    } as any);
  };

  const handleConversationChange = (value: string) => {
    navigate({
      search: ((prev: OrdersSearch) => ({ ...prev, conversation: value, page: 1 })) as any,
      replace: true,
    } as any);
  };

  const handleStatusChange = (status: OrderStatus) => {
    navigate({ search: ((prev: OrdersSearch) => ({ ...prev, status, page: 1 })) as any, replace: true } as any);
  };

  // spec.md AC2: ações Aprovar/Rejeitar visíveis SÓ em linhas
  // status:'pending_approval' — confirmed/rejected (histórico) nunca
  // mostram ação nenhuma, são transições terminais.
  const columns: ColumnDef<OrderRecord, unknown>[] = [
    {
      id: 'customer',
      header: t('order.column.customer'),
      enableSorting: false,
      cell: ({ row }) => row.original.customerName ?? '-',
    },
    {
      id: 'items',
      header: t('order.column.items'),
      enableSorting: false,
      cell: ({ row }) => row.original.items.length,
    },
    {
      id: 'total',
      header: t('order.column.total'),
      enableSorting: false,
      cell: ({ row }) => formatMoney(row.original.totalPrice),
    },
    {
      id: 'status',
      header: t('status'),
      enableSorting: false,
      cell: ({ row }) => (
        <Badge variant={STATUS_BADGE_VARIANT[row.original.status]}>{t(`order.status.${row.original.status}`)}</Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.status === 'pending_approval' ? (
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="success"
              onClick={() => handleApprove(row.original.id)}
              disabled={approveMutation.isPending}
            >
              {t('order.approve.action')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => handleReject(row.original.id)}
              disabled={rejectMutation.isPending}
            >
              {t('order.reject.action')}
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <Card asPage>
      <CardHeader title={t('order.list.title')} />
      <CardContent>
        <div className="mb-3 flex gap-2">
          {STATUS_FILTERS.map((filter) => (
            <Button
              key={filter.value}
              type="button"
              size="sm"
              variant={search.status === filter.value ? 'primary' : 'basic'}
              onClick={() => handleStatusChange(filter.value)}
            >
              {filter.label}
            </Button>
          ))}
        </div>
        {query.isLoading ? (
          <DefaultLoading />
        ) : (
          <DataTable
            data={query.data?.items ?? []}
            columns={columns}
            pageCount={pageCount}
            state={tableState}
            onPaginationChange={handlePaginationChange}
            onSortingChange={() => {}}
            searchValue={search.conversation}
            onSearchChange={handleConversationChange}
            emptyState={<DefaultEmptyData />}
          />
        )}
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute('/_private/orders/')({
  component: OrdersIndexPage,
  staticData: { title: t('order.list.title') },
  validateSearch: (search: Record<string, unknown>): OrdersSearch => ordersSearchSchema.parse(search),
});
