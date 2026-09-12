// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const postMock = vi.fn();
vi.mock('@/lib/api/client.api.js', () => ({ post: postMock }));

const navigateMock = vi.fn();
// Mesmo mock mínimo de schedule/professionals/add/index.unit.test.tsx
// (apps/web/CLAUDE.md — padrão obrigatório de teste de rota).
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

const { SpaceAddPage } = await import('./index.js');

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <SpaceAddPage />
    </QueryClientProvider>,
  );
}

describe('SpaceAddPage (T35, spec.md SCH-04)', () => {
  afterEach(() => {
    cleanup();
    postMock.mockReset();
    navigateMock.mockReset();
  });

  it('submits name via POST /spaces and navigates back to the listing on success', async () => {
    postMock.mockResolvedValue({ success: true, data: { id: 'sp1', name: 'Sala 1', active: true } });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Nome'), 'Sala 1');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(postMock).toHaveBeenCalledWith('/spaces', { name: 'Sala 1' }));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: '/schedule/spaces' }));
  });

  it('rejects an empty name via createSpaceSchema (SCH-04) — validation error shown, POST never called, no navigation', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('name é obrigatório')).toBeInTheDocument();
    expect(postMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("shows the backend's error message on failure, never navigating away from the form", async () => {
    postMock.mockResolvedValue({ success: false, message: 'Não foi possível criar o ambiente.' });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Nome'), 'Sala 1');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Não foi possível criar o ambiente.')).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
