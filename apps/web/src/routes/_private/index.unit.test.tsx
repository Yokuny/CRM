// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sessionQuery } from '../../query/session.js';

// useLocation/useMatches/useRouter: dependências do Card asPage (T8) — sem
// <RouterProvider> neste teste isolado de página, os hooks reais do
// TanStack Router lançam. Mocks mínimos só para não quebrar o render; o
// comportamento de breadcrumb/back-button do Card não é escopo deste teste.
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useLocation: () => ({ pathname: '/' }),
    useMatches: () => [],
    useRouter: () => ({ history: { back: vi.fn() } }),
  };
});

const { PrivateIndexPage } = await import('./index.js');

describe('PrivateIndexPage', () => {
  afterEach(() => cleanup());

  it("shows the tenant name and the user's role read from GET /auth/session (FND-10/AC2)", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(sessionQuery.queryKey, {
      tenant: { id: 't1', name: 'Empresa X', status: 'active' },
      user: { id: 'u1', name: 'Admin', email: 'admin@empresa.com' },
      role: ['admin', 'gestor'],
    });

    render(
      <QueryClientProvider client={queryClient}>
        <PrivateIndexPage />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Empresa X')).toBeInTheDocument();
    expect(screen.getByText('Papel: admin, gestor')).toBeInTheDocument();
  });
});
