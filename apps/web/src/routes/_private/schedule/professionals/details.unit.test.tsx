// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Radix Checkbox usa APIs que o jsdom não implementa — mesmo polyfill
// mínimo já usado em products/details.unit.test.tsx.
beforeAll(() => {
  // biome-ignore lint/suspicious/noExplicitAny: polyfill mínimo, jsdom não implementa ResizeObserver
  (global as any).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const getMock = vi.fn();
const patchMock = vi.fn();
vi.mock('@/lib/api/client.api.js', () => ({ get: getMock, patch: patchMock }));

const searchMock = vi.fn();
// Mesmo mock mínimo de products/details.unit.test.tsx (apps/web/CLAUDE.md —
// padrão obrigatório de teste de rota).
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useSearch: () => searchMock(),
    useLocation: () => ({ pathname: '/' }),
    useMatches: () => [],
    useRouter: () => ({ history: { back: vi.fn() } }),
  };
});

const { ProfessionalDetailsPage } = await import('./details.js');

const PROFESSIONAL = {
  id: 'pr1',
  name: 'Dra. Ana',
  slotDurationMinutes: 30,
  weeklySchedule: [{ weekday: 1, start: '09:00', end: '12:00' }],
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderPage() {
  // retry:false — professionalQuery lança em success:false (404/erro), e o
  // retry exponencial padrão do TanStack Query atrasaria o estado
  // isLoading:false/isError:true além do timeout padrão de findBy* nos
  // testes de "não encontrado" abaixo. Mesmo ajuste de orders/index.unit.test.tsx.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProfessionalDetailsPage />
    </QueryClientProvider>,
  );
}

describe('ProfessionalDetailsPage (T34, spec.md SCH-05)', () => {
  afterEach(() => {
    cleanup();
    getMock.mockReset();
    patchMock.mockReset();
    searchMock.mockReset();
  });

  it("loads via GET /professionals/:id and pre-fills the form with the professional's current fields", async () => {
    searchMock.mockReturnValue({ id: 'pr1' });
    getMock.mockResolvedValue({ success: true, data: PROFESSIONAL });

    renderPage();

    expect(await screen.findByLabelText('Nome')).toHaveValue('Dra. Ana');
    expect(screen.getByLabelText('Duração do horário (min)')).toHaveValue(30);
    expect(screen.getByRole('checkbox', { name: 'Ativo' })).toBeChecked();
    const mondayGroup = screen.getByTestId('weekly-schedule-weekday-1');
    expect(within(mondayGroup).getAllByLabelText('Início')[0]).toHaveValue('09:00');
  });

  it('shows an explicit not-found state when GET /professionals/:id fails (missing id or another tenant)', async () => {
    searchMock.mockReturnValue({ id: 'missing-id' });
    getMock.mockResolvedValue({ success: false, message: 'Profissional não encontrado' });

    renderPage();

    expect(await screen.findByText('Nenhum registro encontrado.')).toBeInTheDocument();
  });

  it('toggling active off and saving calls PATCH /professionals/:id with active:false, then re-fills from the server response (SCH-05)', async () => {
    searchMock.mockReturnValue({ id: 'pr1' });
    getMock.mockResolvedValue({ success: true, data: PROFESSIONAL });
    patchMock.mockResolvedValue({ success: true, data: { ...PROFESSIONAL, active: false } });
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText('Nome');

    await user.click(screen.getByRole('checkbox', { name: 'Ativo' }));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(patchMock).toHaveBeenCalledWith('/professionals/pr1', {
        name: 'Dra. Ana',
        slotDurationMinutes: 30,
        weeklySchedule: [{ weekday: 1, start: '09:00', end: '12:00' }],
        active: false,
      });
    });
    expect(screen.getByRole('checkbox', { name: 'Ativo' })).not.toBeChecked();
  });

  it("shows the backend's error message on failure, keeping the form's current (unsaved) values intact", async () => {
    searchMock.mockReturnValue({ id: 'pr1' });
    getMock.mockResolvedValue({ success: true, data: PROFESSIONAL });
    patchMock.mockResolvedValue({ success: false, message: 'Profissional não encontrado' });
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText('Nome');

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Profissional não encontrado')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome')).toHaveValue('Dra. Ana');
  });

  it('editing slotDurationMinutes and saving submits the new value via PATCH', async () => {
    searchMock.mockReturnValue({ id: 'pr1' });
    getMock.mockResolvedValue({ success: true, data: PROFESSIONAL });
    patchMock.mockResolvedValue({ success: true, data: { ...PROFESSIONAL, slotDurationMinutes: 45 } });
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText('Nome');

    fireEvent.change(screen.getByLabelText('Duração do horário (min)'), { target: { value: '45' } });
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(patchMock).toHaveBeenCalledWith('/professionals/pr1', {
        name: 'Dra. Ana',
        slotDurationMinutes: 45,
        weeklySchedule: [{ weekday: 1, start: '09:00', end: '12:00' }],
        active: true,
      });
    });
    expect(await screen.findByLabelText('Duração do horário (min)')).toHaveValue(45);
  });
});
