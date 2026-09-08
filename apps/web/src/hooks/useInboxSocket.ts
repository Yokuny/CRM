import type { QueryClient } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { type ConversationsListResult, conversationKeys } from '../query/conversation.js';
import { type MessageRecord, type MessagesListResult, messageKeys } from '../query/message.js';

// design.md, Componente 2 (apps/crm-api/src/ws/inboxSocket.ts) — mesmo shape
// de InboxWsEvent do back-end, espelhado aqui (não importado: apps/web nunca
// importa de apps/crm-api, mesma fronteira de todo `query/*.ts`).
export type InboxWsEvent =
  | { type: 'conversation.updated'; conversationId: string; lastActivityAt: string; unread: boolean }
  | { type: 'message.new'; conversationId: string; message: MessageRecord };

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

// Mesmo host:porta de VITE_API_URL (lib/api/client.api.ts) — o WS é anexado
// ao MESMO httpServer do crm-api (design.md, Componente 2/server.ts),
// nenhuma porta/caminho separado. http(s) -> ws(s), sem path extra: o
// WebSocketServer do back-end aceita upgrade em qualquer path
// (new WebSocketServer({server: httpServer}), sem opção `path`).
const buildSocketUrl = (): string => {
  const apiUrl = (import.meta.env.VITE_API_URL as string | undefined) || window.location.origin;
  return apiUrl.replace(/^http/, 'ws');
};

// INBOX-01/04: 'conversation.updated' atualiza a fila (design.md) — só os
// campos que o evento carrega (lastActivityAt/unread), no item já cacheado
// por conversationsQuery (T18), em TODAS as páginas/filtros cacheados que
// contêm essa Conversation. Nunca invalida (refetch de rede) — o próprio
// objetivo do evento é evitar o "GET /conversations inteiro" (spec.md
// INBOX-01/AC4).
const applyConversationUpdated = (
  queryClient: QueryClient,
  event: Extract<InboxWsEvent, { type: 'conversation.updated' }>,
): void => {
  queryClient.setQueriesData<ConversationsListResult>({ queryKey: conversationKeys.lists() }, (old) =>
    old
      ? {
          ...old,
          items: old.items.map((item) =>
            item.id === event.conversationId
              ? { ...item, lastActivityAt: event.lastActivityAt, unread: event.unread }
              : item,
          ),
        }
      : old,
  );
};

// INBOX-05/07: 'message.new' entrega a mensagem pra quem tem a thread aberta
// (spec.md INBOX-05/AC4) — anexada nas páginas de messagesQuery (T19) já
// cacheadas para essa Conversation, sem precisar refazer o GET
// /conversations/:id/messages inteiro.
const applyMessageNew = (queryClient: QueryClient, event: Extract<InboxWsEvent, { type: 'message.new' }>): void => {
  queryClient.setQueriesData<MessagesListResult>(
    { queryKey: messageKeys.listsForConversation(event.conversationId) },
    (old) => (old ? { items: [...old.items, event.message], total: old.total + 1 } : old),
  );
};

const applyInboxEvent = (queryClient: QueryClient, event: InboxWsEvent): void => {
  if (event.type === 'message.new') {
    applyMessageNew(queryClient, event);
    return;
  }
  applyConversationUpdated(queryClient, event);
};

const parseInboxEvent = (raw: unknown): InboxWsEvent | undefined => {
  try {
    const parsed: unknown = JSON.parse(String(raw));
    const type = (parsed as { type?: unknown }).type;
    if (type === 'conversation.updated' || type === 'message.new') return parsed as InboxWsEvent;
    return undefined;
  } catch {
    return undefined;
  }
};

// design.md, Componente 6: primeiro hook de WS do projeto — WebSocket nativo
// do navegador (cookie httpOnly vai junto automaticamente, mesmo domínio,
// AD-014), sem client lib nova. `conversationId` é a thread ABERTA no
// momento (search.id da rota Inbox, T21) — `undefined` quando nenhuma thread
// está aberta (só a fila é assistida, via sala tenant:<id> que o back-end já
// entra sozinho no handshake).
export function useInboxSocket(conversationId: string | undefined): void {
  const queryClient = useQueryClient();
  const conversationIdRef = useRef(conversationId);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  // Uma única conexão por ciclo de vida do hook — reconecta com backoff
  // exponencial simples (1s, 2s, 4s, ... teto 30s) em queda de conexão
  // inesperada, nunca em loop apertado (Done-when T20). `stopped` evita
  // reconectar depois que o próprio componente desmonta (cleanup chamou
  // socket.close(), o que também dispara 'close' — sem essa guarda,
  // reconectaria um socket que ninguém mais quer).
  useEffect(() => {
    let stopped = false;
    let reconnectAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = (): void => {
      const socket = new WebSocket(buildSocketUrl());
      socketRef.current = socket;

      socket.addEventListener('open', () => {
        reconnectAttempt = 0;
        if (conversationIdRef.current) {
          socket.send(JSON.stringify({ type: 'subscribe', conversationId: conversationIdRef.current }));
        }
        // spec.md Edge Case 1: uma queda de conexão pode ter perdido eventos
        // (ex.: reinício do crm-api) — ao (re)conectar, resincroniza via GET
        // normal (invalidateQueries, nunca um refetch imediato de rede: só
        // marca stale, quem decide buscar de novo é o observer ativo de cada
        // query, mesmo padrão de query/message.ts). A fila é sempre
        // resincronizada; a thread aberta só quando existe uma (T20 mesma
        // ref usada para o subscribe acima).
        queryClient.invalidateQueries({ queryKey: conversationKeys.lists() });
        if (conversationIdRef.current) {
          queryClient.invalidateQueries({ queryKey: messageKeys.listsForConversation(conversationIdRef.current) });
        }
      });

      socket.addEventListener('message', (event) => {
        const inboxEvent = parseInboxEvent((event as MessageEvent).data);
        if (inboxEvent) applyInboxEvent(queryClient, inboxEvent);
      });

      socket.addEventListener('close', () => {
        if (socketRef.current === socket) socketRef.current = null;
        if (stopped) return;
        const delay = Math.min(INITIAL_BACKOFF_MS * 2 ** reconnectAttempt, MAX_BACKOFF_MS);
        reconnectAttempt += 1;
        reconnectTimer = setTimeout(connect, delay);
      });
    };

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [queryClient]);

  // Troca de thread aberta: sai da sala da Conversation anterior e entra na
  // nova (design.md, Componente 2 — mensagens {type:'subscribe'|
  // 'unsubscribe', conversationId}). Só envia quando o socket está
  // realmente aberto — se estiver reconectando, o handler 'open' acima já
  // assina a Conversation atual (conversationIdRef) assim que a conexão
  // voltar, sem precisar duplicar aqui.
  useEffect(() => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN && conversationId) {
      socket.send(JSON.stringify({ type: 'subscribe', conversationId }));
    }
    return () => {
      if (socket && socket.readyState === WebSocket.OPEN && conversationId) {
        socket.send(JSON.stringify({ type: 'unsubscribe', conversationId }));
      }
    };
  }, [conversationId]);
}
