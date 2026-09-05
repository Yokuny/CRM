// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Stand-in mínimo de <Link>: o comportamento de "aba ativa" (data-status)
// é do próprio TanStack Router (não código nosso) — o que este teste
// protege é que os DOIS lados do toggle apontam pro alvo certo.
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    Link: ({ to, children }: { to: string; children?: ReactNode }) => <a href={to}>{children}</a>,
  };
});

const { CustomersViewToggle } = await import('./view-toggle.js');

describe('CustomersViewToggle (T21)', () => {
  afterEach(cleanup);

  it('links to /customers (table) and /customers/kanban from either side of the toggle', () => {
    render(<CustomersViewToggle />);

    expect(screen.getByRole('link', { name: 'Tabela' })).toHaveAttribute('href', '/customers');
    expect(screen.getByRole('link', { name: 'Kanban' })).toHaveAttribute('href', '/customers/kanban');
  });
});
