// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { conversationKeys } from '../query/conversation.js';
import { messageKeys } from '../query/message.js';
import { useInboxSocket } from './useInboxSocket.js';

type Listener = (event: unknown) => void;

// Mock mínimo do WebSocket nativo do navegador (Done-when T20: "Teste com
// WebSocket global mockado") — só o suficiente pra simular open/message/close
// e capturar o que o hook manda via send().
class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  url: string;
  sent: string[] = [];
  private listeners = new Map<string, Set<Listener>>();

  constructor(url: string) {
    this.url = url;
    instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.emit('close', {});
  }

  emitOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.emit('open', {});
  }

  emitMessage(payload: unknown): void {
    this.emit('message', { data: JSON.stringify(payload) });
  }

  emitClose(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.emit('close', {});
  }

  private emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

let instances: MockWebSocket[] = [];

// A mesma queryClient é passada explicitamente (não criada dentro do
// wrapper) pra permitir inspeção direta do cache nos testes — renderHook não
// devolve o QueryClient usado internamente pelo Provider.
function renderWithClient(conversationId: string | undefined, queryClient: QueryClient) {
  return renderHook(({ id }: { id: string | undefined }) => useInboxSocket(id), {
    initialProps: { id: conversationId },
    wrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  });
}

describe('useInboxSocket (INBOX-04/07)', () => {
  beforeEach(() => {
    instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('connects and applies a message.new event into the cached message list for that Conversation, without a network refetch', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(messageKeys.list('conv-1', { page: 1 }), {
      items: [{ id: 'm1', direction: 'in', type: 'text', text: 'oi', createdAt: '2026-01-01T00:00:00.000Z' }],
      total: 1,
    });
    renderWithClient('conv-1', queryClient);
    const socket = instances[0];
    socket.emitOpen();

    socket.emitMessage({
      type: 'message.new',
      conversationId: 'conv-1',
      message: { id: 'm2', direction: 'in', type: 'text', text: 'segunda', createdAt: '2026-01-01T00:01:00.000Z' },
    });

    const cached = queryClient.getQueryData(messageKeys.list('conv-1', { page: 1 })) as {
      items: { id: string }[];
      total: number;
    };
    expect(cached.items.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(cached.total).toBe(2);
  });

  it('applies a conversation.updated event into the cached queue item (lastActivityAt/unread), without a network refetch', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(conversationKeys.list({}), {
      items: [{ id: 'conv-1', customer: 'c1', mode: 'bot', lastActivityAt: '2026-01-01T00:00:00.000Z', unread: false }],
      total: 1,
    });
    renderWithClient(undefined, queryClient);
    const socket = instances[0];
    socket.emitOpen();

    socket.emitMessage({ type: 'conversation.updated', conversationId: 'conv-1', lastActivityAt: 'X', unread: true });

    const cached = queryClient.getQueryData(conversationKeys.list({})) as {
      items: { id: string; lastActivityAt: string; unread: boolean }[];
    };
    expect(cached.items[0]).toMatchObject({ id: 'conv-1', lastActivityAt: 'X', unread: true });
  });

  it('reconnects with backoff after an unexpected close, without hammering a new connection immediately (no tight loop)', () => {
    const queryClient = new QueryClient();
    renderWithClient('conv-1', queryClient);
    expect(instances).toHaveLength(1);
    instances[0].emitOpen();

    instances[0].emitClose();
    // Nenhuma nova conexão imediatamente após a queda — backoff, não loop
    // apertado (Done-when T20).
    expect(instances).toHaveLength(1);

    vi.advanceTimersByTime(999);
    expect(instances).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(instances).toHaveLength(2);
  });

  it('re-subscribes on reconnect to whichever Conversation is open at that moment', () => {
    const queryClient = new QueryClient();
    renderWithClient('conv-1', queryClient);
    instances[0].emitOpen();
    instances[0].emitClose();
    vi.advanceTimersByTime(1000);

    expect(instances).toHaveLength(2);
    instances[1].emitOpen();

    expect(instances[1].sent).toContainEqual(JSON.stringify({ type: 'subscribe', conversationId: 'conv-1' }));
  });

  it('sends unsubscribe for the previous Conversation and subscribe for the new one when the open thread changes', () => {
    const queryClient = new QueryClient();
    const { rerender } = renderWithClient('conv-1', queryClient);
    const socket = instances[0];
    socket.emitOpen();
    socket.sent = [];

    rerender({ id: 'conv-2' });

    expect(socket.sent).toEqual([
      JSON.stringify({ type: 'unsubscribe', conversationId: 'conv-1' }),
      JSON.stringify({ type: 'subscribe', conversationId: 'conv-2' }),
    ]);
  });

  it('closes the socket and does not reconnect after unmount', () => {
    const queryClient = new QueryClient();
    const { unmount } = renderWithClient('conv-1', queryClient);
    instances[0].emitOpen();

    unmount();

    expect(instances[0].readyState).toBe(MockWebSocket.CLOSED);
    vi.advanceTimersByTime(60_000);
    expect(instances).toHaveLength(1);
  });
});
