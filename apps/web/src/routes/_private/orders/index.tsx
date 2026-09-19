import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router';
import type { ColumnDef, OnChangeFn, PaginationState } from '@tanstack/react-table';
import { toast } from 'sonner';
import { z } from 'zod';
import { DefaultEmptyData } from '@/components/default-empty-data.js';
import { DefaultLoading } from '@/components/default-loading.js';
import { BadgeIndicator } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { ButtonGroup } from '@/components/ui/button-group.js';
import { Card, CardContent, CardHeader } from '@/components/ui/card.js';
import { Input } from '@/components/ui/input.js';
import { useDebouncedSearch } from '@/hooks/useDebouncedSearch.js';
import { formatMoney } from '@/lib/helpers/money.helper.js';
import { t } from '@/lib/helpers/translate.helper.js';
import {
  approveOrderMutation,
  type OrderRecord,
  type OrderStatus,
  ordersQuery,
  rejectOrderMutation,
} from '@/query/order.js';
import { OrdersTable } from './@components/orders-table.js';
import { ORDER_STATUS_BADGE_VARIANT, PAYMENT_STATUS_BADGE_VARIANT } from './@utils/order-status.js';

// spec.md P1 "Operador aprova ou rejeita um pedido pendente"/AC1/AC2:
// filtro por status via search (AD-030), default 'pending_approval' — a
// MESMA tela também serve de histórico quando filtrada para
// confirmed/rejected (context.md decisão 5: uma única tela simples, sem
// design rico neste P1, em vez de uma segunda tela). `conversation` é o
// mesmo workaround de assignee em conversation-queue.tsx: <DataTable> exige
// uma busca textual, e o único filtro textual que o back-end de Order de
// fato aceita (order.router.ts) é `conversation`.
export const ordersSearchSchema = z.object({
  status: z
    .enum(['pending_approval', 'confirmed', 'rejected', 'payment_expired'])
    .optional()
    .default('pending_approval'),
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).optional().default(20),
  conversation: z.string().optional().default(''),
});
export type OrdersSearch = z.infer<typeof ordersSearchSchema>;

const STATUS_FILTERS: { value: OrderStatus; label: string }[] = [
  { value: 'pending_approval', label: t('pending_approval') },
  { value: 'confirmed', label: t('confirmed') },
  { value: 'rejected', label: t('rejected') },
  { value: 'payment_expired', label: t('payment_expired') },
];

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

  const [searchInput, handleSearchInput] = useDebouncedSearch(search.conversation, handleConversationChange);

  // spec.md AC2: ações Aprovar/Rejeitar visíveis SÓ em linhas
  // status:'pending_approval' — confirmed/rejected (histórico) nunca
  // mostram ação nenhuma, são transições terminais.
  const columns: ColumnDef<OrderRecord, unknown>[] = [
    {
      id: 'customer',
      header: t('customer'),
      enableSorting: false,
      cell: ({ row }) => row.original.customerName ?? '-',
    },
    {
      id: 'items',
      header: t('items'),
      enableSorting: false,
      cell: ({ row }) => row.original.items.length,
    },
    {
      id: 'total',
      header: t('total'),
      enableSorting: false,
      cell: ({ row }) => formatMoney(row.original.totalPrice),
    },
    {
      id: 'status',
      header: t('status'),
      enableSorting: false,
      cell: ({ row }) => (
        <BadgeIndicator variant={ORDER_STATUS_BADGE_VARIANT[row.original.status]}>
          {t(row.original.status)}
        </BadgeIndicator>
      ),
    },
    {
      id: 'payment',
      header: t('payment'),
      enableSorting: false,
      // spec.md P2 AC1: sem Payment associado, a célula não mostra nada (nem
      // um badge vazio) — só renderiza quando paymentStatus está presente.
      cell: ({ row }) =>
        row.original.paymentStatus ? (
          <BadgeIndicator variant={PAYMENT_STATUS_BADGE_VARIANT[row.original.paymentStatus]}>
            {t(row.original.paymentStatus)}
          </BadgeIndicator>
        ) : null,
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
              variant="success"
              onClick={(event) => {
                event.stopPropagation();
                handleApprove(row.original.id);
              }}
              disabled={approveMutation.isPending}
            >
              {t('approve')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={(event) => {
                event.stopPropagation();
                handleReject(row.original.id);
              }}
              disabled={rejectMutation.isPending}
            >
              {t('reject')}
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <Card asPage>
      <CardHeader title={t('orders')} />
      <CardContent>
        <ButtonGroup className="mb-3">
          {STATUS_FILTERS.map((filter) => (
            <Button
              key={filter.value}
              type="button"
              variant={search.status === filter.value ? 'primary' : 'basic'}
              onClick={() => handleStatusChange(filter.value)}
            >
              {filter.label}
            </Button>
          ))}
        </ButtonGroup>
        {query.isLoading ? (
          <DefaultLoading />
        ) : (
          <div className="flex flex-col gap-4">
            <Input placeholder={t('search')} value={searchInput} onChange={(e) => handleSearchInput(e.target.value)} />
            {(query.data?.items.length ?? 0) === 0 ? (
              <DefaultEmptyData />
            ) : (
              <OrdersTable
                data={query.data?.items ?? []}
                columns={columns}
                pageCount={pageCount}
                pageIndex={search.page - 1}
                pageSize={search.limit}
                onPaginationChange={handlePaginationChange}
                onRowClick={(order) => navigate({ to: '/orders/details', search: { id: order.id } })}
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute('/_private/orders/')({
  component: OrdersIndexPage,
  staticData: { title: t('orders') },
  validateSearch: (search: Record<string, unknown>): OrdersSearch => ordersSearchSchema.parse(search),
});
