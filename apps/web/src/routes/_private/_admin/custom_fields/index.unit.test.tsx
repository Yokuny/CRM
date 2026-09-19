// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
vi.mock('@/lib/api/client.api.js', () => ({ get: getMock }));

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useLocation: () => ({ pathname: '/' }),
    useMatches: () => [],
    useRouter: () => ({ history: { back: vi.fn() } }),
    Link: ({ to, search, children }: { to: string; search?: Record<string, string>; children?: ReactNode }) => (
      <a href={search ? `${to}?${new URLSearchParams(search).toString()}` : to}>{children}</a>
    ),
  };
});

const { CustomFieldsIndexPage } = await import('./index.js');

describe('CustomFieldsIndexPage', () => {
  afterEach(() => {
    cleanup();
    getMock.mockReset();
  });

  it('lists the customer template and every process type (archived ones flagged), each opening its details', async () => {
    getMock.mockImplementation((path: string) => {
      if (path === '/field-templates?targetType=customer') {
        return Promise.resolve({
          success: true,
          data: { items: [{ key: 'default', label: 'Cliente', archived: false }] },
        });
      }
      if (path === '/field-templates?targetType=process') {
        return Promise.resolve({
          success: true,
          data: {
            items: [
              { key: 'tratamento', label: 'Tratamento', archived: false },
              { key: 'antigo', label: 'Tipo antigo', archived: true },
            ],
          },
        });
      }
      throw new Error(`unexpected path ${path}`);
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <CustomFieldsIndexPage />
      </QueryClientProvider>,
    );

    expect((await screen.findByText('Tratamento')).closest('a')).toHaveAttribute(
      'href',
      '/custom_fields/details?targetType=process&key=tratamento',
    );
    expect(screen.getByText('Cliente').closest('a')).toHaveAttribute(
      'href',
      '/custom_fields/details?targetType=customer&key=default',
    );
    expect(screen.getByText('Tipo antigo').closest('a')).toHaveTextContent('Arquivado');
    expect(screen.getByText('Novo tipo de processo').closest('a')).toHaveAttribute('href', '/custom_fields/add');
  });
});
