import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { createRoomRegistry, extractHandshakeCookie, type InboxWsEvent } from './inboxSocket.js';

// Fake mínimo: o registry só chama `.send()` num socket — nunca abre conexão
// real (mesmo espírito de createFakeMetaClient em outboxConsumer.int.test.ts).
const fakeSocket = (): WebSocket => ({ send: vi.fn() }) as unknown as WebSocket;

const sampleEvent: InboxWsEvent = {
  type: 'conversation.updated',
  conversationId: 'conv-1',
  lastActivityAt: '2026-09-08T00:00:00.000Z',
  unread: true,
};

describe('extractHandshakeCookie', () => {
  it('extracts refreshToken from a raw cookie header (design.md Componente 2)', () => {
    expect(extractHandshakeCookie('refreshToken=abc123; other=xyz')).toBe('abc123');
  });

  it('returns undefined when the header is absent', () => {
    expect(extractHandshakeCookie(undefined)).toBeUndefined();
  });

  it('returns undefined when the header has no refreshToken key (malformed/unrelated cookie)', () => {
    expect(extractHandshakeCookie('other=xyz')).toBeUndefined();
    expect(extractHandshakeCookie('not-a-cookie-string')).toBeUndefined();
    expect(extractHandshakeCookie('')).toBeUndefined();
  });
});

describe('createRoomRegistry', () => {
  it('join adds a socket to a room, visible via socketsIn', () => {
    const registry = createRoomRegistry();
    const socket = fakeSocket();

    registry.join('tenant:t1', socket);

    expect(registry.socketsIn('tenant:t1').has(socket)).toBe(true);
  });

  it('broadcast sends the JSON-serialized event to every socket in the room, and only that room', () => {
    const registry = createRoomRegistry();
    const inRoom = fakeSocket();
    const otherRoom = fakeSocket();
    registry.join('tenant:t1', inRoom);
    registry.join('tenant:t2', otherRoom);

    registry.broadcast('tenant:t1', sampleEvent);

    expect(inRoom.send).toHaveBeenCalledTimes(1);
    expect(inRoom.send).toHaveBeenCalledWith(JSON.stringify(sampleEvent));
    expect(otherRoom.send).not.toHaveBeenCalled();
  });

  it('broadcast to an empty/non-existent room never throws (no-op)', () => {
    const registry = createRoomRegistry();

    expect(() => registry.broadcast('tenant:never-joined', sampleEvent)).not.toThrow();
  });

  it('leave removes the socket from every room it was joined to, once called per room (used on connection close, T4)', () => {
    const registry = createRoomRegistry();
    const socket = fakeSocket();
    registry.join('tenant:t1', socket);
    registry.join('tenant:t1:conversation:c1', socket);

    registry.leave('tenant:t1', socket);
    registry.leave('tenant:t1:conversation:c1', socket);

    expect(registry.socketsIn('tenant:t1').has(socket)).toBe(false);
    expect(registry.socketsIn('tenant:t1:conversation:c1').has(socket)).toBe(false);
    // Nenhum vestígio: broadcast pras duas salas não entrega mais nada a ele.
    registry.broadcast('tenant:t1', sampleEvent);
    registry.broadcast('tenant:t1:conversation:c1', sampleEvent);
    expect(socket.send).not.toHaveBeenCalled();
  });

  it('leave on a room the socket never joined is a no-op (never throws)', () => {
    const registry = createRoomRegistry();
    const socket = fakeSocket();

    expect(() => registry.leave('tenant:t1', socket)).not.toThrow();
  });

  it('socketsIn returns an empty set for a room with no members', () => {
    const registry = createRoomRegistry();

    expect(registry.socketsIn('tenant:nobody').size).toBe(0);
  });
});
