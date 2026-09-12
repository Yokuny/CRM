// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const getWithStatusMock = vi.fn();
const postMock = vi.fn();
vi.mock('@/lib/api/client.api.js', () => ({ getWithStatus: getWithStatusMock, post: postMock }));

const searchMock = vi.fn();
// Mesmo mock mínimo de _public/invite/index.unit.test.tsx (apps/web/CLAUDE.md
// — padrão obrigatório de teste de rota).
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

const { toast } = await import('sonner');
const { AppointmentConfirmationPage } = await import('./index.js');

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <AppointmentConfirmationPage />
    </QueryClientProvider>,
  );
}

const publicView = {
  date: '2026-09-15',
  time: '14:00',
  professionalName: 'Dra. Ana',
  spaceName: 'Sala 1',
  customerName: 'João da Silva',
  status: 'pending',
};

describe('AppointmentConfirmationPage (T42, spec.md SCH-22/SCH-23/SCH-24/SCH-25/SCH-26/SCH-28)', () => {
  afterEach(() => {
    cleanup();
    getWithStatusMock.mockReset();
    postMock.mockReset();
    searchMock.mockReset();
    vi.mocked(toast.error).mockReset();
  });

  it('shows an explicit message and never fetches when the token search param is missing', () => {
    searchMock.mockReturnValue({});

    renderPage();

    expect(screen.getByText('Link de confirmação inválido.')).toBeInTheDocument();
    expect(getWithStatusMock).not.toHaveBeenCalled();
  });

  it('shows the loading state while fetching', async () => {
    searchMock.mockReturnValue({ token: 'tok1' });
    getWithStatusMock.mockImplementation(() => new Promise(() => {})); // nunca resolve

    renderPage();

    expect(await screen.findByRole('status')).toBeInTheDocument();
  });

  it('shows a distinct "não encontrado" message for a 404 (invalid token)', async () => {
    searchMock.mockReturnValue({ token: 'missing-token' });
    getWithStatusMock.mockResolvedValue({ success: false, message: 'Link de confirmação não encontrado', status: 404 });

    renderPage();

    expect(await screen.findByText('Link de confirmação não encontrado.')).toBeInTheDocument();
    expect(getWithStatusMock).toHaveBeenCalledWith('/appointment-confirmations/missing-token');
  });

  it('shows a distinct "expirado" message for a 410 (expired token) — never the same text as 404', async () => {
    searchMock.mockReturnValue({ token: 'expired-token' });
    getWithStatusMock.mockResolvedValue({ success: false, message: 'Link de confirmação expirado', status: 410 });

    renderPage();

    expect(await screen.findByText('Link de confirmação expirado.')).toBeInTheDocument();
    expect(screen.queryByText('Link de confirmação não encontrado.')).not.toBeInTheDocument();
  });

  it('shows the public fields (date/time/professional/space/customer/status) for a valid token', async () => {
    searchMock.mockReturnValue({ token: 'tok1' });
    getWithStatusMock.mockResolvedValue({ success: true, data: publicView, status: 200 });

    renderPage();

    expect(await screen.findByText(/2026-09-15/)).toBeInTheDocument();
    expect(screen.getByText('14:00')).toBeInTheDocument();
    expect(screen.getByText('Dra. Ana')).toBeInTheDocument();
    expect(screen.getByText('Sala 1')).toBeInTheDocument();
    expect(screen.getByText('João da Silva')).toBeInTheDocument();
    expect(screen.getByText('Pendente')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar presença' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Não vou comparecer' })).toBeInTheDocument();
  });

  it('confirms presence via POST /appointment-confirmations/:token/confirm and shows the updated status', async () => {
    searchMock.mockReturnValue({ token: 'tok1' });
    getWithStatusMock.mockResolvedValueOnce({ success: true, data: publicView, status: 200 });
    postMock.mockResolvedValue({ success: true, data: { ...publicView, status: 'confirmed' } });
    getWithStatusMock.mockResolvedValueOnce({ success: true, data: { ...publicView, status: 'confirmed' }, status: 200 });
    const user = userEvent.setup();

    renderPage();
    await screen.findByRole('button', { name: 'Confirmar presença' });

    await user.click(screen.getByRole('button', { name: 'Confirmar presença' }));

    await waitFor(() => expect(postMock).toHaveBeenCalledWith('/appointment-confirmations/tok1/confirm'));
    expect(await screen.findByText('Confirmado')).toBeInTheDocument();
  });

  it('cancels via POST /appointment-confirmations/:token/cancel and hides the actions once the status is terminal', async () => {
    searchMock.mockReturnValue({ token: 'tok1' });
    getWithStatusMock.mockResolvedValueOnce({ success: true, data: publicView, status: 200 });
    postMock.mockResolvedValue({ success: true, data: { ...publicView, status: 'canceled_by_customer' } });
    getWithStatusMock.mockResolvedValueOnce({
      success: true,
      data: { ...publicView, status: 'canceled_by_customer' },
      status: 200,
    });
    const user = userEvent.setup();

    renderPage();
    await screen.findByRole('button', { name: 'Não vou comparecer' });

    await user.click(screen.getByRole('button', { name: 'Não vou comparecer' }));

    await waitFor(() => expect(postMock).toHaveBeenCalledWith('/appointment-confirmations/tok1/cancel'));
    expect(await screen.findByText('Cancelado pelo cliente')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar presença' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Não vou comparecer' })).not.toBeInTheDocument();
  });

  it('shows a toast when confirming fails (e.g. an already-terminal appointment, 409)', async () => {
    searchMock.mockReturnValue({ token: 'tok1' });
    getWithStatusMock.mockResolvedValue({ success: true, data: publicView, status: 200 });
    postMock.mockResolvedValue({ success: false, message: 'Agendamento em estado terminal' });
    const user = userEvent.setup();

    renderPage();
    await screen.findByRole('button', { name: 'Confirmar presença' });

    await user.click(screen.getByRole('button', { name: 'Confirmar presença' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Agendamento em estado terminal'));
  });
});
