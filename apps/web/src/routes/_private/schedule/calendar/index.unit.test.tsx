// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addDaysToDisplayDate,
  addMonthsToDisplayDate,
  displayWeekStartOf,
  formatDisplayDate,
  startOfDisplayMonth,
} from '@/lib/helpers/displayTime.helper.js';

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

const { CalendarIndexPage, calendarSearchSchema } = await import('./index.js');

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <CalendarIndexPage />
    </QueryClientProvider>,
  );
}

// Roteia cada GET pro formato de resposta certo — `/appointments` devolve um
// array (appointmentsQuery, T37), `/professionals`/`/spaces` devolvem
// {items,total} (professionalsQuery/spacesQuery, Batch 6).
const mockEmptyEverything = () => {
  getMock.mockImplementation((path: string) => {
    if (path.startsWith('/appointments')) return Promise.resolve({ success: true, data: [] });
    return Promise.resolve({ success: true, data: { items: [], total: 0 } });
  });
};

describe('calendarSearchSchema (T39, AD-028/AD-030 — migração dia/semana/mês)', () => {
  it('accepts an empty search — view/date/professional/space are all optional', () => {
    expect(calendarSearchSchema.parse({})).toEqual({});
  });

  it('accepts view/date/professional/space when present', () => {
    expect(calendarSearchSchema.parse({ view: 'day', date: '2026-09-14', professional: 'p1', space: 's1' })).toEqual({
      view: 'day',
      date: '2026-09-14',
      professional: 'p1',
      space: 's1',
    });
  });

  it('rejects a date that is not YYYY-MM-DD', () => {
    expect(() => calendarSearchSchema.parse({ date: '14/09/2026' })).toThrow();
  });

  it('rejects a view outside day/week/month', () => {
    expect(() => calendarSearchSchema.parse({ view: 'year' })).toThrow();
  });
});

describe('CalendarIndexPage (T39, spec.md SCH-29 — visões de dia/semana/mês)', () => {
  afterEach(() => {
    cleanup();
    getMock.mockReset();
    navigateMock.mockReset();
    searchMock.mockReset();
  });

  it("defaults to the 'week' view anchored on today's date (DISPLAY_TIMEZONE) when absent from the URL", async () => {
    searchMock.mockReturnValue({});
    mockEmptyEverything();

    const today = formatDisplayDate(new Date());
    const expectedFrom = displayWeekStartOf(today);
    const expectedTo = addDaysToDisplayDate(expectedFrom, 7);

    renderPage();

    await waitFor(() => expect(getMock).toHaveBeenCalledWith(`/appointments?from=${expectedFrom}&to=${expectedTo}`));
  });

  it('fetches GET /appointments with from/to derived from the URL date (view=week), plus professional/space filters', async () => {
    searchMock.mockReturnValue({ date: '2026-09-14', professional: 'p1', space: 's1' });
    mockEmptyEverything();

    renderPage();

    await waitFor(() =>
      expect(getMock).toHaveBeenCalledWith('/appointments?from=2026-09-14&to=2026-09-21&professional=p1&space=s1'),
    );
  });

  it('view=day fetches a single-day range [date, date+1)', async () => {
    searchMock.mockReturnValue({ view: 'day', date: '2026-09-16' });
    mockEmptyEverything();

    renderPage();

    await waitFor(() => expect(getMock).toHaveBeenCalledWith('/appointments?from=2026-09-16&to=2026-09-17'));
  });

  it('view=month fetches the full calendar-month range [startOfMonth, nextMonthStart)', async () => {
    searchMock.mockReturnValue({ view: 'month', date: '2026-09-16' });
    mockEmptyEverything();

    renderPage();

    const from = startOfDisplayMonth('2026-09-16');
    const to = addMonthsToDisplayDate(from, 1);
    await waitFor(() => expect(getMock).toHaveBeenCalledWith(`/appointments?from=${from}&to=${to}`));
  });

  it('re-fetches with a shifted from/to when the URL date search param changes (AD-028, never client-side slicing of the same data)', async () => {
    searchMock.mockReturnValue({ date: '2026-09-14' });
    mockEmptyEverything();
    const { unmount } = renderPage();
    await waitFor(() => expect(getMock).toHaveBeenCalledWith('/appointments?from=2026-09-14&to=2026-09-21'));
    unmount();

    getMock.mockClear();
    searchMock.mockReturnValue({ date: '2026-09-21' });
    renderPage();

    await waitFor(() => expect(getMock).toHaveBeenCalledWith('/appointments?from=2026-09-21&to=2026-09-28'));
  });

  it('clicking "Próximo" in week view navigates the date 7 days forward', async () => {
    searchMock.mockReturnValue({ date: '2026-09-14' });
    mockEmptyEverything();
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Nenhum registro encontrado.');

    await user.click(screen.getByRole('button', { name: 'Próximo' }));

    expect(navigateMock).toHaveBeenCalled();
    const searchUpdater = navigateMock.mock.calls[0][0].search;
    expect(searchUpdater({ date: '2026-09-14' })).toEqual({ date: '2026-09-21' });
  });

  it('clicking "Anterior" in day view navigates the date 1 day back (view-aware step)', async () => {
    searchMock.mockReturnValue({ view: 'day', date: '2026-09-14' });
    mockEmptyEverything();
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Nenhum registro encontrado.');

    await user.click(screen.getByRole('button', { name: 'Anterior' }));

    const searchUpdater = navigateMock.mock.calls[0][0].search;
    expect(searchUpdater({ view: 'day', date: '2026-09-14' })).toEqual({ view: 'day', date: '2026-09-13' });
  });

  it('clicking "Hoje" navigates the date to today (DISPLAY_TIMEZONE)', async () => {
    searchMock.mockReturnValue({ date: '2020-01-01' });
    mockEmptyEverything();
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Nenhum registro encontrado.');

    await user.click(screen.getByRole('button', { name: 'Hoje' }));

    const searchUpdater = navigateMock.mock.calls[0][0].search;
    expect(searchUpdater({ date: '2020-01-01' })).toEqual({ date: formatDisplayDate(new Date()) });
  });

  it('clicking "Dia" switches the view search param, keeping the same date', async () => {
    searchMock.mockReturnValue({ date: '2026-09-14' });
    mockEmptyEverything();
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Nenhum registro encontrado.');

    await user.click(screen.getByRole('button', { name: 'Dia' }));

    const searchUpdater = navigateMock.mock.calls[0][0].search;
    expect(searchUpdater({ date: '2026-09-14' })).toEqual({ date: '2026-09-14', view: 'day' });
  });

  it('shows the loading state while the period is being fetched', async () => {
    searchMock.mockReturnValue({ date: '2026-09-14' });
    getMock.mockImplementation(() => new Promise(() => {})); // nunca resolve — mantém o estado "loading"

    renderPage();

    expect(await screen.findByRole('status')).toBeInTheDocument();
  });

  it('shows the default empty state when the period has no appointments/blocks', async () => {
    searchMock.mockReturnValue({ date: '2026-09-14' });
    mockEmptyEverything();

    renderPage();

    expect(await screen.findByText('Nenhum registro encontrado.')).toBeInTheDocument();
  });

  it('renders the fetched appointments/blocks in the time grid (view=week)', async () => {
    searchMock.mockReturnValue({ date: '2026-09-14' });
    getMock.mockImplementation((path: string) => {
      if (path.startsWith('/appointments')) {
        return Promise.resolve({
          success: true,
          data: [
            {
              id: 'a1',
              kind: 'appointment',
              professional: 'p1',
              professionalName: 'Dra. Ana',
              customer: 'c1',
              customerName: 'João',
              start: '2026-09-16T00:00:00.000Z',
              end: '2026-09-16T01:00:00.000Z',
              status: 'pending',
              source: 'operator',
              createdAt: '',
              updatedAt: '',
            },
          ],
        });
      }
      return Promise.resolve({ success: true, data: { items: [], total: 0 } });
    });

    renderPage();

    expect(await screen.findByText('João')).toBeInTheDocument();
  });

  it('renders the MonthView when view=month', async () => {
    searchMock.mockReturnValue({ view: 'month', date: '2026-09-14' });
    getMock.mockImplementation((path: string) => {
      if (path.startsWith('/appointments')) {
        return Promise.resolve({
          success: true,
          data: [
            {
              id: 'a1',
              kind: 'appointment',
              professional: 'p1',
              professionalName: 'Dra. Ana',
              customer: 'c1',
              customerName: 'João',
              start: '2026-09-16T13:00:00.000Z',
              end: '2026-09-16T14:00:00.000Z',
              status: 'pending',
              source: 'operator',
              createdAt: '',
              updatedAt: '',
            },
          ],
        });
      }
      return Promise.resolve({ success: true, data: { items: [], total: 0 } });
    });

    renderPage();

    expect(await screen.findByTestId('month-view')).toBeInTheDocument();
    expect(await screen.findByText('João')).toBeInTheDocument();
  });

  it('clicking "Novo agendamento" opens the AppointmentPanel INLINE (not a dialog) between the toolbar and the grid', async () => {
    searchMock.mockReturnValue({});
    mockEmptyEverything();
    const user = userEvent.setup();

    renderPage();
    await user.click(screen.getByRole('button', { name: 'Novo agendamento' }));

    // Painel inline: some no fluxo normal do documento, nunca com role="dialog".
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Novo agendamento' })).toBeInTheDocument();
  });

  it('clicking "Novo bloqueio" opens the BlockPanel inline', async () => {
    searchMock.mockReturnValue({});
    mockEmptyEverything();
    const user = userEvent.setup();

    renderPage();
    await user.click(screen.getByRole('button', { name: 'Novo bloqueio' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByText('Bloqueio')).toBeInTheDocument();
  });

  it('clicking an existing appointment in the grid opens AppointmentPanel in detail mode for that item (SCH-31/32/34/37)', async () => {
    searchMock.mockReturnValue({ date: '2026-09-14' });
    getMock.mockImplementation((path: string) => {
      if (path.startsWith('/appointments')) {
        return Promise.resolve({
          success: true,
          data: [
            {
              id: 'a1',
              kind: 'appointment',
              professional: 'p1',
              professionalName: 'Dra. Ana',
              customer: 'c1',
              customerName: 'João',
              start: '2026-09-16T00:00:00.000Z',
              end: '2026-09-16T01:00:00.000Z',
              status: 'pending',
              source: 'operator',
              createdAt: '',
              updatedAt: '',
            },
          ],
        });
      }
      return Promise.resolve({ success: true, data: { items: [], total: 0 } });
    });
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByText('João'));

    expect(await screen.findByRole('heading', { name: 'João' })).toBeInTheDocument();
  });

  it('clicking an existing block in the grid opens BlockPanel for that block (SCH-33)', async () => {
    searchMock.mockReturnValue({ date: '2026-09-14' });
    getMock.mockImplementation((path: string) => {
      if (path.startsWith('/appointments')) {
        return Promise.resolve({
          success: true,
          data: [
            {
              id: 'b1',
              kind: 'block',
              professional: 'p1',
              professionalName: 'Dra. Ana',
              title: 'Almoço',
              start: '2026-09-16T15:00:00.000Z',
              end: '2026-09-16T16:00:00.000Z',
              status: 'confirmed',
              source: 'operator',
              createdAt: '',
              updatedAt: '',
            },
          ],
        });
      }
      return Promise.resolve({ success: true, data: { items: [], total: 0 } });
    });
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByText('Almoço'));

    expect(await screen.findByRole('button', { name: 'Remover' })).toBeInTheDocument();
  });
});
