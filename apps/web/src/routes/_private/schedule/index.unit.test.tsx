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

const { ScheduleIndexPage } = await import('./index.js');

describe('ScheduleIndexPage (T43, spec.md SCH-08/SCH-29)', () => {
  afterEach(cleanup);

  it('is a navigation hub linking to the calendar, professionals, spaces and settings pages', () => {
    render(<ScheduleIndexPage />);

    expect(screen.getByRole('link', { name: /Calendário/ })).toHaveAttribute('href', '/schedule/calendar');
    expect(screen.getByRole('link', { name: /Profissionais/ })).toHaveAttribute('href', '/schedule/professionals');
    expect(screen.getByRole('link', { name: /Ambientes/ })).toHaveAttribute('href', '/schedule/spaces');
    expect(screen.getByRole('link', { name: /Configuração da agenda/ })).toHaveAttribute('href', '/schedule/settings');
  });
});
