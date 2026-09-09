import type { OrderStatus } from '@crm/db';
import { rejectOrder as rejectOrderTransition, setOperatorApproved } from '@crm/db';
import type { OrderRecord } from '../repositories/order.repository.js';
import * as orderRepository from '../repositories/order.repository.js';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// AD-010: findById/listOrders (order.repository, T8) já são tenant-scoped —
// um id de outro tenant simplesmente não existe para esta sessão. Mesmo
// idioma 404 de customer.service.ts/conversation.service.ts (spec.md Edge
// Cases: "id ausente e id de outro tenant são indistinguíveis").
export class OrderNotFoundError extends Error {}

// spec.md AC7 ("approve/reject sobre Order já terminal"): ação sobre um Order
// confirmed/rejected responde erro sem mudar nada — o controller (T10)
// traduz para 409.
export class OrderAlreadyTerminalError extends Error {}

// Mesmo clamp de page/limit de product.service.ts/customer.service.ts
// (CORE-12) — o repository (T8) confia neles como já corretos.
const clampPage = (page: number | undefined): number => {
  if (page === undefined || !Number.isFinite(page) || page < 1) return 1;
  return Math.floor(page);
};

const clampLimit = (limit: number | undefined): number => {
  if (limit === undefined || !Number.isFinite(limit) || limit < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(limit), MAX_PAGE_SIZE);
};

export type ListOrdersQuery = {
  page?: number;
  limit?: number;
  status?: OrderStatus;
  conversation?: string;
};

export const listOrders = async (
  tenantId: string,
  query: ListOrdersQuery,
): Promise<{ items: OrderRecord[]; total: number }> =>
  orderRepository.listOrders(tenantId, {
    page: clampPage(query.page),
    limit: clampLimit(query.limit),
    status: query.status,
    conversation: query.conversation,
  });

// Pré-checagem via findById (T8) ANTES de chamar a transição compartilhada
// (packages/db/orderTransitions.ts, AD-033) para poder distinguir
// OrderNotFoundError de OrderAlreadyTerminalError sem acoplar este service às
// duas mensagens de erro genéricas internas daquele módulo (que não são
// exportadas como constantes). Se a transição AINDA ASSIM retornar {error}
// depois da pré-checagem ter confirmado pending_approval, é uma corrida rara
// (o Order virou terminal entre as duas chamadas) — o único caso plausível
// aqui, já que não existe delete de Order nesta feature.
const requirePendingOrder = async (tenantId: string, orderId: string): Promise<OrderRecord> => {
  const existing = await orderRepository.findById(tenantId, orderId);
  if (!existing) throw new OrderNotFoundError('Order não encontrado');
  if (existing.status !== 'pending_approval') throw new OrderAlreadyTerminalError('Order já está em estado terminal');
  return existing;
};

// spec.md AC4/AC5 (P1 "Operador aprova ou rejeita"): registra a aprovação do
// operador; SE a reserva atômica de estoque falhar (chamada internamente por
// setOperatorApproved quando customerConfirmed já é true), o Order retornado
// PERMANECE pending_approval com confirmFailureReason preenchido — isto NÃO É
// um erro deste service (design.md Tech Decisions: "aprovar" é sempre
// registrado, o resultado da tentativa é dado no corpo, não no código HTTP).
export const approveOrder = async (tenantId: string, orderId: string, userId: string) => {
  await requirePendingOrder(tenantId, orderId);
  const result = await setOperatorApproved(tenantId, orderId, userId);
  if ('error' in result) throw new OrderAlreadyTerminalError(result.error);
  return result;
};

// spec.md AC6: rejeição é transição terminal, sem nenhum ajuste de estoque
// (nunca foi reservado enquanto pending_approval).
export const rejectOrder = async (tenantId: string, orderId: string, userId: string, reason?: string) => {
  await requirePendingOrder(tenantId, orderId);
  const result = await rejectOrderTransition(tenantId, orderId, userId, reason);
  if ('error' in result) throw new OrderAlreadyTerminalError(result.error);
  return result;
};
