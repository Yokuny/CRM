// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
    Link: ({ to, children }: { to: string; children?: ReactNode }) => <a href={to}>{children}</a>,
  };
});

const { ProcessesIndexPage } = await import('./index.js');

describe('ProcessesIndexPage', () => {
  afterEach(cleanup);

  it('is a navigation hub pointing back to Customers (Process has no destination without a customer)', () => {
    render(<ProcessesIndexPage />);

    expect(screen.getByRole('link', { name: /Clientes/ })).toHaveAttribute('href', '/customers');
    expect(screen.getByText('Selecione um cliente para ver ou criar processos.')).toBeInTheDocument();
  });
});
