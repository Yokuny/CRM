// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Radix Checkbox ("Mostrar inativos") usa APIs que o jsdom não implementa —
// mesmo polyfill mínimo já usado em products/details.unit.test.tsx.
beforeAll(() => {
  // biome-ignore lint/suspicious/noExplicitAny: polyfill mínimo, jsdom não implementa ResizeObserver
  (global as any).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const getMock = vi.fn();
vi.mock('@/lib/api/client.api.js', () => ({ get: getMock }));

const navigateMock = vi.fn();
const searchMock = vi.fn();
// Mesmo mock mínimo de products/index.unit.test.tsx (apps/web/CLAUDE.md —
// padrão obrigatório de teste de rota, sem <RouterProvider> real).
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useSearch: () => searchMock(),
    useLocation: () => ({ pathname: '/' }),
    useMatches: () => [],
    useRouter: () => ({ history: { back: vi.fn() } }),
    Link: ({ to, children }: { to: string; children?: ReactNode }) => <a href={to}>{children}</a>,
  };
});

const { ProfessionalsIndexPage } = await import('./index.js');

const defaultSearch = { page: 1, limit: 20, showInactive: false };

const PROFESSIONAL = {
  id: 'pr1',
  name: 'Dra. Ana',
  slotDurationMinutes: 30,
  weeklySchedule: [],
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ProfessionalsIndexPage />
    </QueryClientProvider>,
  );
}

describe('ProfessionalsIndexPage (T34, spec.md SCH-01/SCH-08)', () => {
  afterEach(() => {
    cleanup();
    getMock.mockReset();
    navigateMock.mockReset();
    searchMock.mockReset();
  });

  it('loads GET /professionals filtered to active-only by default (showInactive:false -> active=true) and shows name/duration/status', async () => {
    searchMock.mockReturnValue(defaultSearch);
    getMock.mockResolvedValue({ success: true, data: { items: [PROFESSIONAL], total: 1 } });

    renderPage();

    await waitFor(() => expect(getMock).toHaveBeenCalledWith('/professionals?page=1&limit=20&active=true'));
    expect(await screen.findByText('Dra. Ana')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('Ativo')).toBeInTheDocument();
  });

  it('shows "Inativo" for a professional with active:false', async () => {
    searchMock.mockReturnValue({ ...defaultSearch, showInactive: true });
    getMock.mockResolvedValue({
      success: true,
      data: { items: [{ ...PROFESSIONAL, active: false }], total: 1 },
    });

    renderPage();

    expect(await screen.findByText('Inativo')).toBeInTheDocument();
  });

  it('checking "Mostrar inativos" navigates with showInactive:true (search-param-driven, AD-028 — never filtered in memory)', async () => {
    searchMock.mockReturnValue(defaultSearch);
    getMock.mockResolvedValue({ success: true, data: { items: [PROFESSIONAL], total: 1 } });
    const user = userEvent.setup();

    renderPage();
    await screen.findByText('Dra. Ana');

    await user.click(screen.getByRole('checkbox', { name: 'Mostrar inativos' }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalled());
    const searchUpdater = navigateMock.mock.calls[0][0].search;
    expect(searchUpdater(defaultSearch)).toEqual({ ...defaultSearch, showInactive: true, page: 1 });
  });

  it('changing the page updates the URL (server-fetched page, never the whole collection, AD-028)', async () => {
    searchMock.mockReturnValue(defaultSearch);
    getMock.mockResolvedValue({ success: true, data: { items: [PROFESSIONAL], total: 40 } });
    const user = userEvent.setup();

    renderPage();
    await screen.findByText('Dra. Ana');

    await user.click(screen.getByRole('button', { name: /próxima página/i }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalled());
    const searchUpdater = navigateMock.mock.calls[0][0].search;
    expect(searchUpdater(defaultSearch)).toEqual({ ...defaultSearch, page: 2, limit: 20 });
  });

  it('clicking a row navigates to /schedule/professionals/details with that id (AD-030 — search param, never a $id path segment)', async () => {
    searchMock.mockReturnValue(defaultSearch);
    getMock.mockResolvedValue({ success: true, data: { items: [PROFESSIONAL], total: 1 } });

    renderPage();
    const row = (await screen.findByText('Dra. Ana')).closest('tr');
    expect(row).not.toBeNull();
    fireEvent.click(row as HTMLElement);

    expect(navigateMock).toHaveBeenCalledWith({ to: '/schedule/professionals/details', search: { id: 'pr1' } });
  });

  it('shows an explicit empty state (never a blank table) when there are no professionals', async () => {
    searchMock.mockReturnValue(defaultSearch);
    getMock.mockResolvedValue({ success: true, data: { items: [], total: 0 } });

    renderPage();

    expect(await screen.findByText('Nenhum registro encontrado.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders an "Adicionar" link pointing to /schedule/professionals/add', async () => {
    searchMock.mockReturnValue(defaultSearch);
    getMock.mockResolvedValue({ success: true, data: { items: [], total: 0 } });

    renderPage();
    await screen.findByText('Nenhum registro encontrado.');

    expect(screen.getByRole('link', { name: 'Adicionar' })).toHaveAttribute('href', '/schedule/professionals/add');
  });
});
