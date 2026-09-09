import type { QueryClient, UseMutationOptions } from '@tanstack/react-query';
import { queryOptions } from '@tanstack/react-query';
import { get, post } from '../lib/api/client.api.js';

// Espelha OrderRecord/OrderItemRecord de
// apps/crm-api/src/repositories/order.repository.ts — a verdade fica no
// back-end; este tipo só descreve o que a tela de Pedidos (T23) e o card
// inline do Inbox (T24) consomem, mesma convenção de "espelho local" já
// usada em query/product.ts/query/conversation.ts. Datas chegam como string
// ISO (JSON não serializa Date).
export type OrderStatus = 'pending_approval' | 'confirmed' | 'rejected' | 'payment_expired';

// Espelha PaymentStatus de packages/db/src/models/payment.model.ts (via
// apps/crm-api's OrderRecord.paymentStatus, T30/PAY-15) — leitura, apps/web
// nunca escreve Payment (AD-034).
export type PaymentStatus = 'pending' | 'paid' | 'expired' | 'refunded' | 'canceled';

export type OrderItemRecord = { product: string; name: string; unitPrice: number; quantity: number };

export type OrderRecord = {
  id: string;
  conversation: string;
  customer: string;
  // Só preenchido quando a query vem de listOrders (populate best-effort de
  // customer.name no back-end) — mesmo campo opcional do OrderRecord de
  // order.repository.ts.
  customerName?: string;
  // Só preenchido quando existe um Payment para este Order (T30/PAY-15,
  // spec.md P2 AC1) — ausente quando não há Payment, nunca `null`.
  paymentStatus?: PaymentStatus;
  items: OrderItemRecord[];
  totalPrice: number;
  status: OrderStatus;
  idempotencyKey: string;
  customerConfirmed: boolean;
  operatorApproved: boolean;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  confirmFailureReason?: string;
  createdAt: string;
  updatedAt: string;
};

export type OrdersQueryParams = {
  status?: OrderStatus;
  conversation?: string;
  page?: number;
  limit?: number;
};

export type OrdersListResult = { items: OrderRecord[]; total: number };

export const orderKeys = {
  all: ['order'] as const,
  lists: () => [...orderKeys.all, 'list'] as const,
  list: (params: OrdersQueryParams) => [...orderKeys.lists(), params] as const,
};

const buildQueryString = (params: OrdersQueryParams): string => {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  if (params.conversation) search.set('conversation', params.conversation);
  if (params.page !== undefined) search.set('page', String(params.page));
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  const qs = search.toString();
  return qs ? `?${qs}` : '';
};

// spec.md P1 "Operador aprova ou rejeita um pedido pendente"/AC1: fila de
// Orders do tenant, filtro por status (o default 'pending_approval' é
// aplicado no back-end, order.router.ts — não duplicado aqui) e,
// opcionalmente, por conversation. A MESMA função serve as duas superfícies
// da AC3/design.md decisão 5: a tela de Pedidos (T23, sem filtro de
// conversation) e o card inline do Inbox (T24, sempre com
// conversation+status:'pending_approval') — ambas compartilham o prefixo de
// queryKey orderKeys.lists() (ver approveOrderMutation/rejectOrderMutation
// abaixo). AD-028: server-driven, nunca slice/filter em memória.
export const ordersQuery = (params: OrdersQueryParams = {}) =>
  queryOptions({
    queryKey: orderKeys.list(params),
    queryFn: async (): Promise<OrdersListResult> => {
      const res = await get<OrdersListResult>(`/orders${buildQueryString(params)}`);
      if (!res.success || !res.data) throw new Error(res.message ?? 'Não foi possível carregar os pedidos.');
      return res.data;
    },
  });

// spec.md AC4 (P1 "Operador aprova ou rejeita"): aprova um Order
// pending_approval (POST /orders/:id/approve, sem corpo — o controller já
// não lê nada além do :id/tenantUser). Invalida QUALQUER ordersQuery já
// cacheada (orderKeys.lists() é um prefixo, casa por qualquer combinação de
// status/conversation/página) — cobre tanto a tela de Pedidos (T23) quanto
// o card do Inbox (T24) no mesmo golpe, então um Order aprovado some de
// ambas as superfícies sem refresh manual em nenhuma delas.
export const approveOrderMutation = (
  queryClient: QueryClient,
): UseMutationOptions<OrderRecord, Error, { id: string }> => ({
  mutationFn: async ({ id }) => {
    const res = await post<OrderRecord>(`/orders/${encodeURIComponent(id)}/approve`);
    if (!res.success || !res.data) throw new Error(res.message ?? 'Não foi possível aprovar o pedido.');
    return res.data;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
  },
});

// spec.md AC6: rejeita um Order pending_approval (POST /orders/:id/reject),
// `reason` opcional (rejectOrderSchema, packages/contracts). Mesma
// invalidação de approveOrderMutation.
export const rejectOrderMutation = (
  queryClient: QueryClient,
): UseMutationOptions<OrderRecord, Error, { id: string; reason?: string }> => ({
  mutationFn: async ({ id, reason }) => {
    const res = await post<OrderRecord>(`/orders/${encodeURIComponent(id)}/reject`, { reason });
    if (!res.success || !res.data) throw new Error(res.message ?? 'Não foi possível rejeitar o pedido.');
    return res.data;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
  },
});
