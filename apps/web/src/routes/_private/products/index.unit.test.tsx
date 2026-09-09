// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
vi.mock('@/lib/api/client.api.js', () => ({ get: getMock }));

const navigateMock = vi.fn();
const searchMock = vi.fn();
// Mesmo mock mínimo de customers/list/index.unit.test.tsx (apps/web/CLAUDE.md
// — padrão obrigatório de teste de rota, sem <RouterProvider> real).
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

const { ProductsIndexPage } = await import('./index.js');

const defaultSearch = { page: 1, limit: 20, name: '' };

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ProductsIndexPage />
    </QueryClientProvider>,
  );
}

describe('ProductsIndexPage (T19, spec.md P1 "Cadastro de catálogo"/AC2/AC6)', () => {
  afterEach(() => {
    cleanup();
    getMock.mockReset();
    navigateMock.mockReset();
    searchMock.mockReset();
  });

  it('loads GET /products with the URL search state and shows name/price/stock/active, paginated', async () => {
    searchMock.mockReturnValue({ page: 2, limit: 20, name: 'camiseta' });
    getMock.mockResolvedValue({
      success: true,
      data: { items: [{ id: 'p1', name: 'Camiseta', price: 12345, stock: 7, active: true }], total: 21 },
    });

    renderPage();

    await waitFor(() => expect(getMock).toHaveBeenCalledWith('/products?page=2&limit=20&name=camiseta'));
    expect(await screen.findByText('Camiseta')).toBeInTheDocument();
    expect(screen.getByText('R$ 123,45')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('Ativo')).toBeInTheDocument();
  });

  it('shows "Inativo" for a Product with active:false (never hides it from the operator\'s own catalog view)', async () => {
    searchMock.mockReturnValue(defaultSearch);
    getMock.mockResolvedValue({
      success: true,
      data: { items: [{ id: 'p1', name: 'Descontinuado', price: 500, stock: 0, active: false }], total: 1 },
    });

    renderPage();

    expect(await screen.findByText('Inativo')).toBeInTheDocument();
  });

  it('typing a search term sends `name` to the server and updates the URL (server-side, never local filtering, AD-028)', async () => {
    searchMock.mockReturnValue(defaultSearch);
    getMock.mockResolvedValue({
      success: true,
      data: { items: [{ id: 'p1', name: 'Camiseta', price: 1000, stock: 1, active: true }], total: 1 },
    });

    renderPage();
    await screen.findByText('Camiseta');

    fireEvent.change(screen.getByPlaceholderText('Buscar…'), { target: { value: 'camiseta' } });

    await waitFor(() => expect(navigateMock).toHaveBeenCalled());
    const searchUpdater = navigateMock.mock.calls[0][0].search;
    expect(searchUpdater(defaultSearch)).toEqual({ ...defaultSearch, name: 'camiseta', page: 1 });
  });

  it('changing the page updates the URL (server-fetched page, never the whole collection, AD-028)', async () => {
    searchMock.mockReturnValue(defaultSearch);
    getMock.mockResolvedValue({
      success: true,
      data: { items: [{ id: 'p1', name: 'Camiseta', price: 1000, stock: 1, active: true }], total: 40 },
    });

    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Camiseta');

    await user.click(screen.getByRole('button', { name: /próxima página/i }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalled());
    const searchUpdater = navigateMock.mock.calls[0][0].search;
    expect(searchUpdater(defaultSearch)).toEqual({ ...defaultSearch, page: 2, limit: 20 });
  });

  it('clicking a row navigates to /products/details with that Product\'s id (AD-030 — search param, never a $id path segment)', async () => {
    searchMock.mockReturnValue(defaultSearch);
    getMock.mockResolvedValue({
      success: true,
      data: { items: [{ id: 'p1', name: 'Camiseta', price: 1000, stock: 1, active: true }], total: 1 },
    });

    renderPage();
    const row = (await screen.findByText('Camiseta')).closest('tr');
    expect(row).not.toBeNull();
    fireEvent.click(row as HTMLElement);

    expect(navigateMock).toHaveBeenCalledWith({ to: '/products/details', search: { id: 'p1' } });
  });

  it('shows an explicit empty state (never a blank table) when the search returns no Products', async () => {
    searchMock.mockReturnValue(defaultSearch);
    getMock.mockResolvedValue({ success: true, data: { items: [], total: 0 } });

    renderPage();

    expect(await screen.findByText('Nenhum registro encontrado.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders an "Adicionar" link pointing to /products/add', async () => {
    searchMock.mockReturnValue(defaultSearch);
    getMock.mockResolvedValue({ success: true, data: { items: [], total: 0 } });

    renderPage();
    await screen.findByText('Nenhum registro encontrado.');

    expect(screen.getByRole('link', { name: 'Adicionar' })).toHaveAttribute('href', '/products/add');
  });
});
