// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// T22: InboxPage agora renderiza <ConversationQueue> de verdade, que chama
// sessionQuery (`/auth/session`) e conversationsQuery (`/conversations`) —
// precisa de um `get` mockado para não bater na rede real neste teste de
// página isolado (mesmo padrão de customers/details.unit.test.tsx). O
// conteúdo da fila em si é testado em conversation-queue.unit.test.tsx.
const getMock = vi.fn((path: string) => {
  if (path === '/auth/session') {
    return Promise.resolve({
      success: true,
      data: {
        tenant: { id: 't1', name: 'Tenant', status: 'active' },
        user: { id: 'u1', name: 'Ana', email: 'ana@x.com' },
        role: ['operador'],
      },
    });
  }
  return Promise.resolve({ success: true, data: { items: [], total: 0 } });
});
vi.mock('../../../lib/api/client.api.js', () => ({ get: getMock }));

// Mesmo mock mínimo (addEventListener-based) de hooks/useInboxSocket.unit.test.tsx
// (T20) — a página só precisa provar que conecta UM socket e repassa o
// `search.id` adiante, não reimplementar a lógica de conexão (já coberta lá).
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  private listeners = new Map<string, Set<(event: unknown) => void>>();
  addEventListener(type: string, listener: (event: unknown) => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }
  removeEventListener(): void {}
  send = vi.fn();
  close = vi.fn();
  constructor() {
    FakeWebSocket.instances.push(this);
  }
}
vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);

const searchMock = vi.fn();
// Mock mínimo de @tanstack/react-router (apps/web/CLAUDE.md) — Card asPage
// (breadcrumb) precisa de useLocation/useMatches/useRouter/Link (o
// breadcrumb sempre renderiza um <Link to="/">, mesmo quando a própria
// página não usa nenhum), sem <RouterProvider> real; useSearch é o próprio
// search.id da rota (AD-030).
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useSearch: () => searchMock(),
    useLocation: () => ({ pathname: '/inbox' }),
    useMatches: () => [],
    useRouter: () => ({ history: { back: vi.fn() } }),
    Link: ({ to, children }: { to: string; children?: ReactNode }) => <a href={to}>{children}</a>,
  };
});

const { InboxPage } = await import('./index.js');

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <InboxPage />
    </QueryClientProvider>,
  );
}

describe('InboxPage (T21 — esqueleto da rota)', () => {
  afterEach(() => {
    cleanup();
    searchMock.mockReset();
    getMock.mockClear();
    FakeWebSocket.instances = [];
  });

  it('shows no selected thread when search.id is absent', () => {
    searchMock.mockReturnValue({});

    renderPage();

    expect(screen.getByText('Caixa de entrada')).toBeInTheDocument();
    // ConversationQueue (T22) montada de verdade — filtro de mode é prova de
    // que a fila renderizou, sem duplicar a cobertura de
    // conversation-queue.unit.test.tsx aqui.
    expect(screen.getByRole('button', { name: 'Todas' })).toBeInTheDocument();
    expect(screen.queryByTestId('inbox-selected-conversation')).not.toBeInTheDocument();
  });

  it('search.id selects the open conversation (renders the thread panel, not the "select a conversation" hint)', async () => {
    searchMock.mockReturnValue({ id: '507f1f77bcf86cd799439011' });

    renderPage();

    // ConversationThread (T23) resolve a lista vazia mockada — "Nenhuma
    // mensagem ainda." é prova de que a thread montou para este id, em vez
    // do hint de "selecione uma conversa".
    expect(await screen.findByText('Nenhuma mensagem ainda.')).toBeInTheDocument();
    expect(screen.queryByText('Selecione uma conversa na fila para ver o histórico.')).not.toBeInTheDocument();
  });

  it('connects useInboxSocket at the page level (one WebSocket regardless of selection)', () => {
    searchMock.mockReturnValue({ id: '507f1f77bcf86cd799439011' });

    renderPage();

    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
