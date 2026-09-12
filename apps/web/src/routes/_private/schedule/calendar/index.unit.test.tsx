// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addDaysToDisplayDate, currentDisplayWeekStart } from '@/lib/helpers/displayTime.helper.js';

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
// {items,total} (professionalsQuery/spacesQuery, Batch 6) — misturar os dois
// formatos quebraria o `.filter`/`.length` do lado que espera o outro.
const mockEmptyEverything = () => {
  getMock.mockImplementation((path: string) => {
    if (path.startsWith('/appointments')) return Promise.resolve({ success: true, data: [] });
    return Promise.resolve({ success: true, data: { items: [], total: 0 } });
  });
};

describe('calendarSearchSchema (T39, AD-028/AD-030)', () => {
  it('accepts an empty search — weekStart/professional/space are all optional', () => {
    expect(calendarSearchSchema.parse({})).toEqual({});
  });

  it('accepts weekStart/professional/space when present', () => {
    expect(calendarSearchSchema.parse({ weekStart: '2026-09-14', professional: 'p1', space: 's1' })).toEqual({
      weekStart: '2026-09-14',
      professional: 'p1',
      space: 's1',
    });
  });

  it('rejects a weekStart that is not YYYY-MM-DD', () => {
    expect(() => calendarSearchSchema.parse({ weekStart: '14/09/2026' })).toThrow();
  });
});

describe('CalendarIndexPage (T39, spec.md SCH-29)', () => {
  afterEach(() => {
    cleanup();
    getMock.mockReset();
    navigateMock.mockReset();
    searchMock.mockReset();
  });

  it("defaults weekStart to the current week's Monday in DISPLAY_TIMEZONE (displayTime.helper.ts) when absent from the URL", async () => {
    searchMock.mockReturnValue({});
    mockEmptyEverything();

    // Mesmo cálculo que o componente faz (currentDisplayWeekStart, T38) —
    // a matemática de fuso já está coberta por displayTime.helper.unit.test.ts;
    // aqui só se prova que o componente de fato USA esse cálculo como
    // default, nunca a data local do navegador/executor de testes.
    const expectedFrom = currentDisplayWeekStart();
    const expectedTo = addDaysToDisplayDate(expectedFrom, 7);

    renderPage();

    await waitFor(() => expect(getMock).toHaveBeenCalledWith(`/appointments?from=${expectedFrom}&to=${expectedTo}`));
  });

  it('fetches GET /appointments with from/to derived from the URL weekStart, plus professional/space filters', async () => {
    searchMock.mockReturnValue({ weekStart: '2026-09-14', professional: 'p1', space: 's1' });
    mockEmptyEverything();

    renderPage();

    await waitFor(() =>
      expect(getMock).toHaveBeenCalledWith('/appointments?from=2026-09-14&to=2026-09-21&professional=p1&space=s1'),
    );
  });

  // Done-when explícito do T39: "anterior/próxima muda o search e refaz a
  // query" — provado aqui comparando os argumentos de `getMock` ANTES e
  // DEPOIS de um `weekStart` diferente vindo do search param (o mock do
  // router não re-renderiza sozinho ao chamar `navigate`, então o efeito de
  // "clicar next" é simulado como a URL já tendo mudado — a parte que este
  // teste prova é que a MESMA appointmentsQuery reage a um weekStart
  // diferente com um from/to diferente, nunca um recorte em memória do
  // mesmo dado).
  it('re-fetches with a shifted from/to when the URL weekStart search param changes (AD-028, never client-side slicing of the same data)', async () => {
    searchMock.mockReturnValue({ weekStart: '2026-09-14' });
    mockEmptyEverything();
    const { unmount } = renderPage();
    await waitFor(() => expect(getMock).toHaveBeenCalledWith('/appointments?from=2026-09-14&to=2026-09-21'));
    unmount();

    getMock.mockClear();
    searchMock.mockReturnValue({ weekStart: '2026-09-21' });
    renderPage();

    await waitFor(() => expect(getMock).toHaveBeenCalledWith('/appointments?from=2026-09-21&to=2026-09-28'));
  });

  it('clicking "Próxima semana" navigates to a weekStart 7 days after the current one', async () => {
    searchMock.mockReturnValue({ weekStart: '2026-09-14' });
    mockEmptyEverything();
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Nenhum registro encontrado.');

    await user.click(screen.getByRole('button', { name: 'Próxima semana' }));

    expect(navigateMock).toHaveBeenCalled();
    const searchUpdater = navigateMock.mock.calls[0][0].search;
    expect(searchUpdater({ weekStart: '2026-09-14' })).toEqual({ weekStart: '2026-09-21' });
  });

  it('clicking "Semana anterior" navigates to a weekStart 7 days before the current one', async () => {
    searchMock.mockReturnValue({ weekStart: '2026-09-14' });
    mockEmptyEverything();
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Nenhum registro encontrado.');

    await user.click(screen.getByRole('button', { name: 'Semana anterior' }));

    expect(navigateMock).toHaveBeenCalled();
    const searchUpdater = navigateMock.mock.calls[0][0].search;
    expect(searchUpdater({ weekStart: '2026-09-14' })).toEqual({ weekStart: '2026-09-07' });
  });

  it('shows the loading state while the week is being fetched', async () => {
    searchMock.mockReturnValue({ weekStart: '2026-09-14' });
    getMock.mockImplementation(() => new Promise(() => {})); // nunca resolve — mantém o estado "loading"

    renderPage();

    expect(await screen.findByRole('status')).toBeInTheDocument();
  });

  it('shows the default empty state when the week has no appointments/blocks', async () => {
    searchMock.mockReturnValue({ weekStart: '2026-09-14' });
    mockEmptyEverything();

    renderPage();

    expect(await screen.findByText('Nenhum registro encontrado.')).toBeInTheDocument();
  });

  it('renders the WeekGrid with the fetched appointments/blocks', async () => {
    searchMock.mockReturnValue({ weekStart: '2026-09-14' });
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
    expect(await screen.findByRole('heading', { name: 'Novo bloqueio' })).toBeInTheDocument();
  });

  it('clicking an existing appointment in the grid opens AppointmentPanel in detail mode for that item (SCH-31/32/34/37)', async () => {
    searchMock.mockReturnValue({ weekStart: '2026-09-14' });
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
    searchMock.mockReturnValue({ weekStart: '2026-09-14' });
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

    expect(await screen.findByRole('heading', { name: 'Almoço' })).toBeInTheDocument();
  });
});
