// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
vi.mock('../../../lib/api/client.api.js', () => ({ get: getMock }));

const searchMock = vi.fn();
// Mesmo mock mínimo de customers/index.unit.test.tsx (T18) — Card asPage (T8)
// precisa de useLocation/useMatches/useRouter, sem <RouterProvider> real.
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useSearch: () => searchMock(),
    useLocation: () => ({ pathname: '/' }),
    useMatches: () => [],
    useRouter: () => ({ history: { back: vi.fn() } }),
    Link: ({ to, children }: { to: string; children?: ReactNode }) => <a href={to}>{children}</a>,
  };
});

const { CustomerDetailsPage } = await import('./details.js');

function renderPage() {
  // retry:false — a resposta 404 do WEB-05 AC2 (customerQuery lança) senão
  // ficaria retentando (TanStack Query default: 3 tentativas com backoff),
  // deixando `isLoading` verdadeiro além do timeout do findByText.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CustomerDetailsPage />
    </QueryClientProvider>,
  );
}

describe('CustomerDetailsPage (T23 — WEB-05)', () => {
  afterEach(() => {
    cleanup();
    getMock.mockReset();
    searchMock.mockReset();
  });

  it('WEB-05 AC1: fetches via GET /customers/:id (e.g. direct nav/reload) and shows core + values', async () => {
    searchMock.mockReturnValue({ id: 'c1' });
    getMock.mockImplementation((path: string) => {
      if (path === '/customers/c1') {
        return Promise.resolve({
          success: true,
          data: {
            id: 'c1',
            name: 'Ana',
            phone: '11999999999',
            document: '12345678900',
            values: { nickname: 'Aninha' },
          },
        });
      }
      if (path === '/processes?customerId=c1') return Promise.resolve({ success: true, data: { items: [] } });
      throw new Error(`unexpected path ${path}`);
    });

    renderPage();

    expect(await screen.findByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('11999999999')).toBeInTheDocument();
    expect(screen.getByText('12345678900')).toBeInTheDocument();
    expect(screen.getByText('Aninha')).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith('/customers/c1');
  });

  it('WEB-05 AC2: a missing or cross-tenant id shows an explicit not-found state, never a broken screen', async () => {
    searchMock.mockReturnValue({ id: 'missing' });
    getMock.mockImplementation((path: string) => {
      if (path === '/customers/missing') return Promise.resolve({ success: false, message: 'Customer não encontrado' });
      if (path === '/processes?customerId=missing') return Promise.resolve({ success: true, data: { items: [] } });
      throw new Error(`unexpected path ${path}`);
    });

    renderPage();

    expect(await screen.findByText('Nenhum registro encontrado.')).toBeInTheDocument();
    expect(screen.queryByText('Ana')).not.toBeInTheDocument();
  });

  it('WEB-05 AC3: shows the Customer’s Process list via GET /processes?customerId=:id', async () => {
    searchMock.mockReturnValue({ id: 'c1' });
    getMock.mockImplementation((path: string) => {
      if (path === '/customers/c1') {
        return Promise.resolve({ success: true, data: { id: 'c1', name: 'Ana', phone: '119', values: {} } });
      }
      if (path === '/processes?customerId=c1') {
        return Promise.resolve({
          success: true,
          data: {
            items: [
              {
                id: 'p1',
                customer: 'c1',
                template: 't1',
                templateVersion: 1,
                stage: 'aberto',
                values: {},
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
              },
            ],
          },
        });
      }
      throw new Error(`unexpected path ${path}`);
    });

    renderPage();

    expect(await screen.findByText('aberto')).toBeInTheDocument();
  });

  it('WEB-05 AC3: shows an explicit empty state ("nenhum Process ainda") when the Process list is empty', async () => {
    searchMock.mockReturnValue({ id: 'c1' });
    getMock.mockImplementation((path: string) => {
      if (path === '/customers/c1') {
        return Promise.resolve({ success: true, data: { id: 'c1', name: 'Ana', phone: '119', values: {} } });
      }
      if (path === '/processes?customerId=c1') return Promise.resolve({ success: true, data: { items: [] } });
      throw new Error(`unexpected path ${path}`);
    });

    renderPage();

    await screen.findByText('Ana');
    expect(screen.getByText('Nenhum registro encontrado.')).toBeInTheDocument();
  });
});
