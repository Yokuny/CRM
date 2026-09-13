// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const putMock = vi.fn();
vi.mock('@/lib/api/client.api.js', () => ({ get: getMock, put: putMock }));

// Mesmo mock mínimo de schedule/professionals/details.unit.test.tsx
// (apps/web/CLAUDE.md — padrão obrigatório de teste de rota, sem
// <RouterProvider> real). Esta página não usa Link/useNavigate/useSearch.
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useLocation: () => ({ pathname: '/' }),
    useMatches: () => [],
    useRouter: () => ({ history: { back: vi.fn() } }),
  };
});

const { SchedulingSettingsPage } = await import('./index.js');

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <SchedulingSettingsPage />
    </QueryClientProvider>,
  );
}

describe('SchedulingSettingsPage (T36, spec.md SCH-06)', () => {
  afterEach(() => {
    cleanup();
    getMock.mockReset();
    putMock.mockReset();
  });

  it('shows 16 when the tenant never configured maxSlotsPerResponse (spec.md SCH-06 default)', async () => {
    getMock.mockResolvedValue({ success: true, data: { maxSlotsPerResponse: 16 } });

    renderPage();

    expect(await screen.findByLabelText('Máximo de horários por resposta')).toHaveValue(16);
  });

  it('saving 10 calls PUT /scheduling-settings and the displayed value becomes 10', async () => {
    getMock.mockResolvedValue({ success: true, data: { maxSlotsPerResponse: 16 } });
    putMock.mockResolvedValue({ success: true, data: { maxSlotsPerResponse: 10 } });
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText('Máximo de horários por resposta');

    fireEvent.change(screen.getByLabelText('Máximo de horários por resposta'), { target: { value: '10' } });
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(putMock).toHaveBeenCalledWith('/scheduling-settings', { maxSlotsPerResponse: 10 }));
    expect(await screen.findByLabelText('Máximo de horários por resposta')).toHaveValue(10);
  });

  it('rejects 0 via updateSchedulingSettingsSchema — validation error shown, PUT never called', async () => {
    getMock.mockResolvedValue({ success: true, data: { maxSlotsPerResponse: 16 } });
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText('Máximo de horários por resposta');

    fireEvent.change(screen.getByLabelText('Máximo de horários por resposta'), { target: { value: '0' } });
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('maxSlotsPerResponse inválido')).toBeInTheDocument();
    expect(putMock).not.toHaveBeenCalled();
  });

  it('rejects 51 via updateSchedulingSettingsSchema — validation error shown, PUT never called', async () => {
    getMock.mockResolvedValue({ success: true, data: { maxSlotsPerResponse: 16 } });
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText('Máximo de horários por resposta');

    fireEvent.change(screen.getByLabelText('Máximo de horários por resposta'), { target: { value: '51' } });
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('maxSlotsPerResponse inválido')).toBeInTheDocument();
    expect(putMock).not.toHaveBeenCalled();
  });

  it("shows the backend's error message on failure, keeping the form's current (unsaved) value intact", async () => {
    getMock.mockResolvedValue({ success: true, data: { maxSlotsPerResponse: 16 } });
    putMock.mockResolvedValue({ success: false, message: 'Não foi possível salvar a configuração da agenda.' });
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText('Máximo de horários por resposta');

    fireEvent.change(screen.getByLabelText('Máximo de horários por resposta'), { target: { value: '20' } });
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Não foi possível salvar a configuração da agenda.')).toBeInTheDocument();
    expect(screen.getByLabelText('Máximo de horários por resposta')).toHaveValue(20);
  });
});
