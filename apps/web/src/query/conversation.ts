import { queryOptions } from '@tanstack/react-query';
import { get } from '../lib/api/client.api.js';

// Espelha ConversationListItem de
// apps/crm-api/src/repositories/conversation.repository.ts (`listConversations`)
// — a verdade fica no back-end; este tipo só descreve o que a fila (T22)
// consome, mesma convenção de "espelho local" já usada em query/customer.ts
// (CustomerRecord). Datas chegam como string ISO (JSON não serializa Date).
export type ConversationMode = 'bot' | 'human';

export type ConversationRecord = {
  id: string;
  customer: string;
  mode: ConversationMode;
  assignee?: string;
  // INBOX-10/AC5 (Fix 1, validation.md): nome real do assignee, já resolvido
  // no back-end (conversation.service.ts, mesmo findUserView usado pelo
  // conflito 409) — undefined quando não há assignee.
  assigneeName?: string;
  lastActivityAt: string;
  unread: boolean;
  windowOpen: boolean;
  windowExpiresAt?: string;
};

export type ConversationsQueryParams = {
  mode?: ConversationMode;
  assignee?: string;
  page?: number;
  limit?: number;
};

export type ConversationsListResult = { items: ConversationRecord[]; total: number };

// SPEC_DEVIATION: tasks.md (T18) também lista `conversationQuery(id)` no
// molde de `customerQuery(id)` (query/customer.ts). Não há `GET
// /conversations/:id` no backend — `apps/crm-api/src/routers/
// conversation.router.ts` só expõe `GET /conversations` (lista) e `GET
// /:id/messages` (histórico); os 26 tasks do plano completo (tasks.md) nunca
// alocam uma task para um endpoint de conversa única. Mesma situação já
// resolvida neste repositório por `query/process.ts` ("Não há GET
// /processes/:id... toda tela que precisa de UM Process resolve filtrando
// `items` desta mesma lista") — seguido aqui: só `conversationsQuery`
// (lista) é exportada; uma tela que precisar de UMA Conversation resolve
// filtrando `items` pelo `id` do search param, nunca uma segunda rota
// inexistente.
export const conversationKeys = {
  all: ['conversation'] as const,
  lists: () => [...conversationKeys.all, 'list'] as const,
  list: (params: ConversationsQueryParams) => [...conversationKeys.lists(), params] as const,
};

const buildQueryString = (params: ConversationsQueryParams): string => {
  const search = new URLSearchParams();
  if (params.mode) search.set('mode', params.mode);
  if (params.assignee) search.set('assignee', params.assignee);
  if (params.page !== undefined) search.set('page', String(params.page));
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  const qs = search.toString();
  return qs ? `?${qs}` : '';
};

// INBOX-01/03: fila de conversas do tenant da sessão, filtro opcional por
// mode/assignee, paginação server-driven (AD-028).
export const conversationsQuery = (params: ConversationsQueryParams = {}) =>
  queryOptions({
    queryKey: conversationKeys.list(params),
    queryFn: async (): Promise<ConversationsListResult> => {
      const res = await get<ConversationsListResult>(`/conversations${buildQueryString(params)}`);
      if (!res.success || !res.data) throw new Error(res.message ?? 'Não foi possível carregar as conversas.');
      return res.data;
    },
  });
