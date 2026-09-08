import type { Server } from 'node:http';
import { parseCookie } from 'cookie';
import type { WebSocket } from 'ws';
import { WebSocketServer } from 'ws';
import type { AuthDeps } from '../middlewares/authentication.middleware.js';
import { authenticateSession } from '../middlewares/authentication.middleware.js';

// design.md, Componente 2: extrai o cookie httpOnly `refreshToken` do header
// `cookie` cru do handshake WS — `cookie-parser` (Express) nunca roda no
// evento `upgrade`, então esta é a única forma de ler a credencial de sessão
// antes de aceitar a conexão. `parseCookie` nunca lança para header
// ausente/malformado — devolve `{}`, e o acesso a `refreshToken` vira
// `undefined` (mesmo idioma de falha que `authenticateSession`, T2, já trata).
export const extractHandshakeCookie = (header: string | undefined): string | undefined => {
  if (!header) return undefined;
  return parseCookie(header).refreshToken;
};

// design.md, Componente 2: payload do evento distribuído a clientes
// conectados — 'conversation.updated' atualiza a fila, 'message.new' entrega
// a mensagem para quem tem a thread aberta (inboxPoller, T5).
export type MessageWirePayload = {
  id: string;
  conversationId: string;
  direction: 'in' | 'out';
  type: 'text' | 'audio' | 'image' | 'document' | 'location' | 'unsupported';
  status?: string;
  text?: string;
  media?: { mediaId: string; mime?: string; caption?: string };
  createdAt: string;
};

export type InboxWsEvent =
  | { type: 'conversation.updated'; conversationId: string; lastActivityAt: string; unread: boolean }
  | { type: 'message.new'; conversationId: string; message: MessageWirePayload };

// design.md, Componente 2: duas "salas" em memória, `Map<string, Set<WebSocket>>`
// — sem lib de pub/sub (AD-002, instância única). `join`/`leave` operam por
// sala específica; sair de TODAS as salas que uma conexão participava (ex.:
// ao desconectar) é responsabilidade de quem já sabe quais salas entrou
// (createInboxSocketServer, T4) chamando `leave` uma vez por sala.
export const createRoomRegistry = () => {
  const rooms = new Map<string, Set<WebSocket>>();

  const join = (room: string, socket: WebSocket): void => {
    const sockets = rooms.get(room) ?? new Set<WebSocket>();
    sockets.add(socket);
    rooms.set(room, sockets);
  };

  const leave = (room: string, socket: WebSocket): void => {
    const sockets = rooms.get(room);
    if (!sockets) return;
    sockets.delete(socket);
    if (sockets.size === 0) rooms.delete(room);
  };

  const socketsIn = (room: string): Set<WebSocket> => rooms.get(room) ?? new Set<WebSocket>();

  // Sala vazia/inexistente nunca lança — broadcast pra uma conversation sem
  // ninguém com a thread aberta é um no-op esperado (o inboxPoller varre só
  // tenants conectados, não garante que a conversation específica tenha
  // alguém olhando).
  const broadcast = (room: string, event: InboxWsEvent): void => {
    const sockets = rooms.get(room);
    if (!sockets) return;
    const payload = JSON.stringify(event);
    for (const socket of sockets) socket.send(payload);
  };

  return { join, leave, broadcast, socketsIn };
};

export type RoomRegistry = ReturnType<typeof createRoomRegistry>;

// Fecha o handshake antes de aceitar qualquer subscribe/mensagem (design.md,
// Componente 2, "Fluxo de conexão") — faixa 4000-4999 é reservada para uso de
// aplicação no protocolo WebSocket (RFC 6455 §7.4.2).
const AUTH_FAILED_CLOSE_CODE = 4401;

const tenantRoom = (tenantId: string): string => `tenant:${tenantId}`;
const conversationRoom = (tenantId: string, conversationId: string): string =>
  `tenant:${tenantId}:conversation:${conversationId}`;

type SubscriptionMessage = { type: 'subscribe' | 'unsubscribe'; conversationId: string };

const parseSubscriptionMessage = (raw: WebSocket.RawData): SubscriptionMessage | undefined => {
  try {
    const parsed: unknown = JSON.parse(raw.toString());
    const isValid =
      typeof parsed === 'object' &&
      parsed !== null &&
      ((parsed as { type?: unknown }).type === 'subscribe' || (parsed as { type?: unknown }).type === 'unsubscribe') &&
      typeof (parsed as { conversationId?: unknown }).conversationId === 'string';
    return isValid ? (parsed as SubscriptionMessage) : undefined;
  } catch {
    // Payload malformado nunca derruba a conexão — só é ignorado (mesmo
    // espírito de defesa em profundidade do resto do projeto: entrada
    // inválida nunca vira exceção não tratada).
    return undefined;
  }
};

type ConnectionState = { tenantId: string; conversationRooms: Set<string> };

export type InboxSocketServer = {
  broadcastToTenant: (tenantId: string, event: InboxWsEvent) => void;
  broadcastToConversation: (tenantId: string, conversationId: string, event: InboxWsEvent) => void;
  getConnectedTenantIds: () => string[];
  close: () => void;
};

// design.md, Componente 2: anexa um WebSocketServer (`ws`) ao MESMO
// http.Server que `app.listen()` já retorna (T6) — nunca abre uma porta
// própria. Autentica cada handshake pelo cookie httpOnly (T2/T3), mantém as
// duas salas em memória (fila `tenant:<id>` e thread `tenant:<id>:
// conversation:<id>`) e expõe broadcast pro inboxPoller (T5).
export const createInboxSocketServer = (httpServer: Server, authDeps: AuthDeps): InboxSocketServer => {
  const wss = new WebSocketServer({ server: httpServer });
  const registry = createRoomRegistry();
  const connections = new Map<WebSocket, ConnectionState>();

  wss.on('connection', (socket, request) => {
    void (async () => {
      try {
        const token = extractHandshakeCookie(request.headers.cookie);
        const deviceInfo = (request.headers['user-agent'] as string | undefined) ?? 'unknown';
        const tenantUser = await authenticateSession(token, deviceInfo, authDeps);
        // Inbox é uma feature tenant-scoped (AD-010) — uma sessão sem tenant
        // (isPlatformAdmin) não tem fila nenhuma pra assistir.
        if (!tenantUser.tenant) throw new Error('Sessão sem tenant não pode usar o Inbox');

        const tenantId = tenantUser.tenant;
        const state: ConnectionState = { tenantId, conversationRooms: new Set() };
        connections.set(socket, state);
        registry.join(tenantRoom(tenantId), socket);
        console.log(JSON.stringify({ event: 'ws.connected', tenantId }));

        socket.on('message', (raw) => {
          const message = parseSubscriptionMessage(raw);
          if (!message) return;

          const room = conversationRoom(tenantId, message.conversationId);
          if (message.type === 'subscribe') {
            registry.join(room, socket);
            state.conversationRooms.add(room);
          } else {
            registry.leave(room, socket);
            state.conversationRooms.delete(room);
          }
        });

        socket.on('close', () => {
          registry.leave(tenantRoom(tenantId), socket);
          for (const room of state.conversationRooms) registry.leave(room, socket);
          connections.delete(socket);
          console.log(JSON.stringify({ event: 'ws.disconnected', tenantId }));
        });
      } catch (e) {
        console.error(JSON.stringify({ event: 'ws.auth_failed', message: e instanceof Error ? e.message : String(e) }));
        socket.close(AUTH_FAILED_CLOSE_CODE, 'Unauthorized');
      }
    })();
  });

  return {
    broadcastToTenant: (tenantId, event) => registry.broadcast(tenantRoom(tenantId), event),
    broadcastToConversation: (tenantId, conversationId, event) =>
      registry.broadcast(conversationRoom(tenantId, conversationId), event),
    // AD-006: o inboxPoller varre só tenants com pelo menos um socket
    // conectado — derivado das conexões autenticadas atuais, nunca de uma
    // lista mantida à parte.
    getConnectedTenantIds: () => {
      const ids = new Set<string>();
      for (const state of connections.values()) ids.add(state.tenantId);
      return [...ids];
    },
    // Encerra toda conexão aberta ANTES de fechar o server (T6: stopWorkers
    // não pode deixar processo pendurado por socket ainda vivo).
    close: () => {
      for (const socket of wss.clients) socket.terminate();
      wss.close();
    },
  };
};
