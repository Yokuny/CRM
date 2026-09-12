// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const postMock = vi.fn();
vi.mock('@/lib/api/client.api.js', () => ({ post: postMock }));

const navigateMock = vi.fn();
// Mesmo mock mínimo de products/add/index.unit.test.tsx (apps/web/CLAUDE.md
// — padrão obrigatório de teste de rota).
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useLocation: () => ({ pathname: '/' }),
    useMatches: () => [],
    useRouter: () => ({ history: { back: vi.fn() } }),
  };
});

const { ProfessionalAddPage } = await import('./index.js');

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ProfessionalAddPage />
    </QueryClientProvider>,
  );
}

describe('ProfessionalAddPage (T34, spec.md SCH-01)', () => {
  afterEach(() => {
    cleanup();
    postMock.mockReset();
    navigateMock.mockReset();
  });

  it('submits name/slotDurationMinutes/weeklySchedule via POST /professionals and navigates back to the listing on success', async () => {
    postMock.mockResolvedValue({
      success: true,
      data: {
        id: 'pr1',
        name: 'Dra. Ana',
        slotDurationMinutes: 30,
        weeklySchedule: [{ weekday: 1, start: '09:00', end: '12:00' }],
        active: true,
      },
    });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Nome'), 'Dra. Ana');

    const mondayGroup = screen.getByTestId('weekly-schedule-weekday-1');
    await user.click(within(mondayGroup).getByRole('button', { name: 'Adicionar' }));
    fireEvent.change(within(mondayGroup).getAllByLabelText('Início')[0] as HTMLElement, {
      target: { value: '09:00' },
    });
    fireEvent.change(within(mondayGroup).getAllByLabelText('Fim')[0] as HTMLElement, { target: { value: '12:00' } });

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith('/professionals', {
        name: 'Dra. Ana',
        slotDurationMinutes: 30,
        weeklySchedule: [{ weekday: 1, start: '09:00', end: '12:00' }],
      });
    });
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: '/schedule/professionals' }));
  });

  it('rejects an empty name via createProfessionalSchema (SCH-02) — validation error shown, POST never called, no navigation', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('name é obrigatório')).toBeInTheDocument();
    expect(postMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('rejects overlapping windows on the same weekday (SCH-03) — validation error shown, POST never called', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Nome'), 'Dra. Ana');

    const mondayGroup = screen.getByTestId('weekly-schedule-weekday-1');
    await user.click(within(mondayGroup).getByRole('button', { name: 'Adicionar' }));
    await user.click(within(mondayGroup).getByRole('button', { name: 'Adicionar' }));
    const starts = within(mondayGroup).getAllByLabelText('Início');
    const ends = within(mondayGroup).getAllByLabelText('Fim');
    fireEvent.change(starts[0] as HTMLElement, { target: { value: '09:00' } });
    fireEvent.change(ends[0] as HTMLElement, { target: { value: '12:00' } });
    fireEvent.change(starts[1] as HTMLElement, { target: { value: '11:00' } });
    fireEvent.change(ends[1] as HTMLElement, { target: { value: '13:00' } });

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('janelas sobrepostas no mesmo weekday')).toBeInTheDocument();
    expect(postMock).not.toHaveBeenCalled();
  });

  it("shows the backend's error message on failure, never navigating away from the form", async () => {
    postMock.mockResolvedValue({ success: false, message: 'Não foi possível criar o profissional.' });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Nome'), 'Dra. Ana');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Não foi possível criar o profissional.')).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
