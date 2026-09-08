import type { QueryClient } from '@tanstack/react-query';
import { queryOptions } from '@tanstack/react-query';
import { get, post } from '../lib/api/client.api.js';

// Espelha MessageListItem/MessageRecord de
// apps/crm-api/src/repositories/conversation.repository.ts — a verdade fica
// no back-end; este tipo só descreve o que a thread (T23) consome, mesma
// convenção de "espelho local" já usada em query/customer.ts. Datas chegam
// como string ISO (JSON não serializa Date).
export type MessageDirection = 'in' | 'out';
export type MessageType = 'text' | 'audio' | 'image' | 'document' | 'location' | 'unsupported';

export type MessageMedia = { mediaId: string; mime?: string; caption?: string };

export type MessageRecord = {
  id: string;
  direction: MessageDirection;
  type: MessageType;
  status?: string;
  text?: string;
  media?: MessageMedia;
  templateName?: string;
  templateLanguage?: string;
  templateParams?: Record<string, string>;
  createdAt: string;
};

export type MessagesQueryParams = { page?: number; limit?: number };
export type MessagesListResult = { items: MessageRecord[]; total: number };

export const messageKeys = {
  all: ['message'] as const,
  lists: () => [...messageKeys.all, 'list'] as const,
  // Chave intermediária (sem `params`) — usada por resendMessage (INBOX-14)
  // para invalidar TODAS as páginas/filtros de mensagens de UMA Conversation
  // de uma vez (TanStack Query casa por prefixo), sem afetar a lista de
  // mensagens de outra Conversation.
  listsForConversation: (conversationId: string) => [...messageKeys.lists(), conversationId] as const,
  list: (conversationId: string, params: MessagesQueryParams) =>
    [...messageKeys.listsForConversation(conversationId), params] as const,
};

const buildQueryString = (params: MessagesQueryParams): string => {
  const search = new URLSearchParams();
  if (params.page !== undefined) search.set('page', String(params.page));
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  const qs = search.toString();
  return qs ? `?${qs}` : '';
};

// INBOX-05/06: histórico paginado de uma Conversation, em ordem cronológica
// (a ordenação em si é responsabilidade do back-end, T9).
export const messagesQuery = (conversationId: string, params: MessagesQueryParams = {}) =>
  queryOptions({
    queryKey: messageKeys.list(conversationId, params),
    queryFn: async (): Promise<MessagesListResult> => {
      const res = await get<MessagesListResult>(
        `/conversations/${encodeURIComponent(conversationId)}/messages${buildQueryString(params)}`,
      );
      if (!res.success || !res.data) throw new Error(res.message ?? 'Não foi possível carregar as mensagens.');
      return res.data;
    },
  });

// INBOX-14: cria a nova Message (clone, status:queued) via POST .../resend e
// invalida a query de mensagens dessa Conversation — a UI (T23) refetcha a
// thread e mostra a nova tentativa abaixo da original, que nunca é alterada
// (spec.md P2 AC3). Não é uma queryOptions (não há cache de "resend" para
// ler) — mesmo padrão de mutação inline já usado no projeto (ex.:
// CustomerEditForm, routes/_private/customers/details.tsx), só que
// centralizado aqui porque mais de uma tela (composer T25, thread T23)
// precisa chamar a mesma ação.
export const resendMessage = async (
  queryClient: QueryClient,
  conversationId: string,
  messageId: string,
): Promise<MessageRecord> => {
  const res = await post<MessageRecord>(
    `/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/resend`,
  );
  if (!res.success || !res.data) throw new Error(res.message ?? 'Não foi possível reenviar a mensagem.');
  await queryClient.invalidateQueries({ queryKey: messageKeys.listsForConversation(conversationId) });
  return res.data;
};

// Mesmo cálculo de BASE_URL de lib/api/client.api.ts (privado lá, não
// exportado) — duplicado aqui de propósito: esta função NÃO é um fetch (T19,
// "helper de URL, NÃO um fetch"), é só a string que um <img>/<a> (media-card,
// T24) usa direto como src/href, então não passa pelo request()/get()/post()
// que já teriam o BASE_URL embutido.
const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

// INBOX-17: aponta pra rota de proxy de mídia sob demanda (T17) — nunca
// busca/decodifica o binário aqui, só monta a URL.
export const mediaUrl = (conversationId: string, messageId: string): string =>
  `${BASE_URL}/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/media`;
