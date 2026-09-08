import { parseCookie } from 'cookie';
import type { WebSocket } from 'ws';

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
