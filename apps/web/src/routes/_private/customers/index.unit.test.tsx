// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
vi.mock('../../../lib/api/client.api.js', () => ({ get: getMock }));

const navigateMock = vi.fn();
const searchMock = vi.fn();
// useLocation/useMatches/useRouter: dependências do Card asPage (T8) — mesmo
// mock mínimo de auth/index.unit.test.tsx e invite/index.unit.test.tsx.
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useSearch: () => searchMock(),
    // pathname '/' (não '/customers'): PageBreadcrumb (Card asPage, T8) só
    // renderiza `<Link>` reais quando há segmentos de path — mesmo mock
    // mínimo já usado em auth/index.unit.test.tsx e invite/index.unit.test.tsx
    // para não precisar de um <RouterProvider> de verdade nestes testes de
    // página isolados; o comportamento do breadcrumb não é escopo daqui.
    useLocation: () => ({ pathname: '/' }),
    useMatches: () => [],
    useRouter: () => ({ history: { back: vi.fn() } }),
  };
});

const { CustomersListPage } = await import('./index.js');

const defaultSearch = { page: 1, limit: 20, q: '', sort: 'createdAt' as const, order: 'desc' as const };

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <CustomersListPage />
    </QueryClientProvider>,
  );
}

describe('CustomersListPage (T18 — WEB-01, WEB-09)', () => {
  afterEach(() => {
    cleanup();
    getMock.mockReset();
    navigateMock.mockReset();
    searchMock.mockReset();
  });

  it('WEB-01 AC1 + WEB-09 AC2: loads GET /customers with the URL search state and shows name/phone/status, paginated', async () => {
    searchMock.mockReturnValue({ page: 2, limit: 20, q: 'ana', sort: 'name', order: 'asc', status: 'ativo' });
    getMock.mockResolvedValue({
      success: true,
      data: { items: [{ id: '1', name: 'Ana', phone: '11999999999', values: { status: 'ativo' } }], total: 21 },
    });

    renderPage();

    await waitFor(() =>
      expect(getMock).toHaveBeenCalledWith('/customers?page=2&limit=20&q=ana&sort=name&order=asc&status=ativo'),
    );
    expect(await screen.findByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('11999999999')).toBeInTheDocument();
    expect(screen.getByText('ativo')).toBeInTheDocument();
  });

  it('WEB-01 AC2 + WEB-09 AC1: typing a search term sends `q` to the server and updates the URL (server-side, never local filtering)', async () => {
    searchMock.mockReturnValue(defaultSearch);
    getMock.mockResolvedValue({
      success: true,
      data: { items: [{ id: '1', name: 'Ana', phone: '1', values: {} }], total: 1 },
    });

    renderPage();
    await screen.findByText('Ana');

    fireEvent.change(screen.getByPlaceholderText('Buscar…'), { target: { value: 'ana' } });

    await waitFor(() => expect(navigateMock).toHaveBeenCalled());
    const searchUpdater = navigateMock.mock.calls[0][0].search;
    expect(searchUpdater(defaultSearch)).toEqual({ ...defaultSearch, q: 'ana', page: 1 });
  });

  it('WEB-01 AC3 + WEB-09 AC1: changing the sort updates the URL (server-fetched sort, never a local re-sort)', async () => {
    searchMock.mockReturnValue(defaultSearch);
    getMock.mockResolvedValue({
      success: true,
      data: { items: [{ id: '1', name: 'Ana', phone: '1', values: {} }], total: 1 },
    });

    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Ana');

    await user.click(screen.getByRole('button', { name: 'Nome' }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalled());
    const searchUpdater = navigateMock.mock.calls[0][0].search;
    expect(searchUpdater(defaultSearch)).toEqual({ ...defaultSearch, sort: 'name', order: 'asc', page: 1 });
  });

  it('WEB-01 AC3 + WEB-09 AC1: changing the page updates the URL (server-fetched page, never the whole collection)', async () => {
    searchMock.mockReturnValue(defaultSearch);
    getMock.mockResolvedValue({
      success: true,
      data: { items: [{ id: '1', name: 'Ana', phone: '1', values: {} }], total: 40 },
    });

    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Ana');

    await user.click(screen.getByRole('button', { name: /próxima página/i }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalled());
    const searchUpdater = navigateMock.mock.calls[0][0].search;
    expect(searchUpdater(defaultSearch)).toEqual({ ...defaultSearch, page: 2, limit: 20 });
  });

  it('WEB-01 AC4: shows an explicit empty state (never a blank table) when the search returns no Customers', async () => {
    searchMock.mockReturnValue(defaultSearch);
    getMock.mockResolvedValue({ success: true, data: { items: [], total: 0 } });

    renderPage();

    expect(await screen.findByText('Nenhum registro encontrado.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
