// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const postMock = vi.fn();
vi.mock('@/lib/api/client.api.js', () => ({ post: postMock }));

const navigateMock = vi.fn();
// Mock mínimo de @tanstack/react-router (apps/web/CLAUDE.md, Testes).
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

const { KanbanAddPage } = await import('./index.js');

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <KanbanAddPage />
    </QueryClientProvider>,
  );
}

describe('KanbanAddPage (T16, spec.md KAN-01/KAN-02)', () => {
  afterEach(() => {
    cleanup();
    postMock.mockReset();
    navigateMock.mockReset();
  });

  it('submits the form via POST /boards with the default initial column and navigates to the new board (KAN-01)', async () => {
    postMock.mockResolvedValue({
      success: true,
      data: { id: 'b1', name: 'Cobranças', columns: [{ id: 'c1', label: 'A fazer', order: 0 }], updatedAt: '' },
    });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Nome'), 'Cobranças');
    await user.type(screen.getByLabelText('Nome da coluna'), 'A fazer');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith('/boards', {
        name: 'Cobranças',
        description: '',
        columns: [{ label: 'A fazer' }],
      });
    });
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: '/kanban/details', search: { id: 'b1' } }));
  });

  it('allows adding a second column via "Adicionar coluna" (KAN-01)', async () => {
    postMock.mockResolvedValue({
      success: true,
      data: { id: 'b1', name: 'Board', columns: [], updatedAt: '' },
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Adicionar coluna' }));
    const columnInputs = screen.getAllByLabelText('Nome da coluna');
    expect(columnInputs).toHaveLength(2);

    await user.type(screen.getByLabelText('Nome'), 'Board');
    await user.type(columnInputs[0] as HTMLElement, 'A fazer');
    await user.type(columnInputs[1] as HTMLElement, 'Feito');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith('/boards', {
        name: 'Board',
        description: '',
        columns: [{ label: 'A fazer' }, { label: 'Feito' }],
      });
    });
  });

  it('rejects submitting with zero columns via createBoardSchema (KAN-02) — validation error shown BEFORE any API call', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Nome'), 'Board vazio');
    // Remove a única coluna inicial — a UI nunca desabilita o botão de
    // remover, a validação client-side acontece só na submissão.
    await user.click(screen.getByRole('button', { name: 'Remover' }));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('board precisa de ao menos 1 coluna')).toBeInTheDocument();
    expect(postMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("shows the backend's error message on failure, never navigating away from the form", async () => {
    postMock.mockResolvedValue({ success: false, message: 'Não foi possível criar o board.' });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Nome'), 'Cobranças');
    await user.type(screen.getByLabelText('Nome da coluna'), 'A fazer');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Não foi possível criar o board.')).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
