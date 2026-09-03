// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { sessionQuery } from '../../query/session.js';
import { PrivateIndexPage } from './index.js';

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
