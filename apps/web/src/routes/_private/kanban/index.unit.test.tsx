// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
vi.mock('@/lib/api/client.api.js', () => ({ get: getMock }));

// Mock mínimo de @tanstack/react-router (apps/web/CLAUDE.md, Testes) — sem
// <RouterProvider> real.
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useLocation: () => ({ pathname: '/' }),
    useMatches: () => [],
    useRouter: () => ({ history: { back: vi.fn() } }),
    Link: ({ to, search, children }: { to: string; search?: Record<string, unknown>; children?: ReactNode }) => (
      <a href={search ? `${to}?${new URLSearchParams(search as Record<string, string>).toString()}` : to}>{children}</a>
    ),
  };
});

const { KanbanIndexPage } = await import('./index.js');

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <KanbanIndexPage />
    </QueryClientProvider>,
  );
}

describe('KanbanIndexPage (T15, spec.md KAN-03)', () => {
  afterEach(() => {
    cleanup();
    getMock.mockReset();
  });

  it('shows the loading state while the boards query is pending', () => {
    getMock.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByRole('status', { name: 'Carregando…' })).toBeInTheDocument();
  });

  it('shows an explicit empty state when the tenant has no board (spec.md Edge Cases)', async () => {
    getMock.mockResolvedValue({ success: true, data: [] });

    renderPage();

    expect(await screen.findByText('Nenhum registro encontrado.')).toBeInTheDocument();
  });

  it('lists the boards returned by the server, in the order received (KAN-03: server already sorts by updatedAt desc)', async () => {
    getMock.mockResolvedValue({
      success: true,
      data: [
        { id: 'b1', name: 'Mais recente', columns: [], cardCount: 3, createdAt: '', updatedAt: '' },
        { id: 'b2', name: 'Mais antigo', description: 'Quadro de cobranças', columns: [], cardCount: 0, updatedAt: '' },
      ],
    });

    renderPage();
    await screen.findByText('Mais recente');

    const boardNames = screen.getAllByRole('link').map((el) => el.textContent);
    const firstBoardIndex = boardNames.findIndex((text) => text?.includes('Mais recente'));
    const secondBoardIndex = boardNames.findIndex((text) => text?.includes('Mais antigo'));
    expect(firstBoardIndex).toBeGreaterThanOrEqual(0);
    expect(secondBoardIndex).toBeGreaterThan(firstBoardIndex);
    expect(screen.getByText('Quadro de cobranças')).toBeInTheDocument();
    expect(screen.getByText('3 Cards')).toBeInTheDocument();
    expect(screen.getByText('0 Cards')).toBeInTheDocument();
  });

  it('each board links to /kanban/details with search:{id} (AD-030, never a $id path segment)', async () => {
    getMock.mockResolvedValue({
      success: true,
      data: [{ id: 'b1', name: 'Cobranças', columns: [], cardCount: 1, updatedAt: '' }],
    });

    renderPage();

    const link = await screen.findByRole('link', { name: /Cobranças/ });
    expect(link).toHaveAttribute('href', '/kanban/details?id=b1');
  });

  it('renders an "Adicionar" link pointing to /kanban/add', async () => {
    getMock.mockResolvedValue({ success: true, data: [] });

    renderPage();
    await screen.findByText('Nenhum registro encontrado.');

    expect(screen.getByRole('link', { name: 'Adicionar' })).toHaveAttribute('href', '/kanban/add');
  });
});
