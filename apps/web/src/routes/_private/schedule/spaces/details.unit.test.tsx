// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Radix Checkbox usa APIs que o jsdom não implementa — mesmo polyfill
// mínimo já usado em schedule/professionals/details.unit.test.tsx.
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
// Mesmo mock mínimo de schedule/professionals/details.unit.test.tsx
// (apps/web/CLAUDE.md — padrão obrigatório de teste de rota).
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

const { SpaceDetailsPage } = await import('./details.js');

const SPACE = {
  id: 'sp1',
  name: 'Sala 1',
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderPage() {
  // retry:false — spaceQuery lança em success:false (404/erro), mesmo
  // ajuste de schedule/professionals/details.unit.test.tsx.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SpaceDetailsPage />
    </QueryClientProvider>,
  );
}

describe('SpaceDetailsPage (T35, spec.md SCH-04)', () => {
  afterEach(() => {
    cleanup();
    getMock.mockReset();
    patchMock.mockReset();
    searchMock.mockReset();
  });

  it('shows the Space in read-only view mode by default', async () => {
    searchMock.mockReturnValue({ id: 'sp1' });
    getMock.mockResolvedValue({ success: true, data: SPACE });

    renderPage();

    expect(await screen.findByText('Sala 1')).toBeInTheDocument();
    expect(screen.getByText('Ativo')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument();
  });

  it("clicking Editar pre-fills the form with the space's current fields", async () => {
    searchMock.mockReturnValue({ id: 'sp1' });
    getMock.mockResolvedValue({ success: true, data: SPACE });
    const user = userEvent.setup();

    renderPage();
    await screen.findByText('Sala 1');
    await user.click(screen.getByRole('button', { name: 'Editar' }));

    expect(await screen.findByLabelText('Nome')).toHaveValue('Sala 1');
    expect(screen.getByRole('checkbox', { name: 'Ativo' })).toBeChecked();
  });

  it('shows an explicit not-found state when GET /spaces/:id fails (missing id or another tenant)', async () => {
    searchMock.mockReturnValue({ id: 'missing-id' });
    getMock.mockResolvedValue({ success: false, message: 'Ambiente não encontrado' });

    renderPage();

    expect(await screen.findByText('Nenhum registro encontrado.')).toBeInTheDocument();
  });

  it('toggling active off and saving calls PATCH /spaces/:id with active:false, then re-fills from the server response', async () => {
    searchMock.mockReturnValue({ id: 'sp1' });
    getMock.mockResolvedValue({ success: true, data: SPACE });
    patchMock.mockResolvedValue({ success: true, data: { ...SPACE, active: false } });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Sala 1');
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await screen.findByLabelText('Nome');

    await user.click(screen.getByRole('checkbox', { name: 'Ativo' }));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(patchMock).toHaveBeenCalledWith('/spaces/sp1', { name: 'Sala 1', active: false }));
    // Volta ao modo visualização com o novo status — mesmo padrão de
    // CustomerEditForm em customers/details.tsx.
    expect(await screen.findByText('Inativo')).toBeInTheDocument();
  });

  it("shows the backend's error message on failure, keeping the form's current (unsaved) values intact", async () => {
    searchMock.mockReturnValue({ id: 'sp1' });
    getMock.mockResolvedValue({ success: true, data: SPACE });
    patchMock.mockResolvedValue({ success: false, message: 'Ambiente não encontrado' });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Sala 1');
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await screen.findByLabelText('Nome');

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Ambiente não encontrado')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome')).toHaveValue('Sala 1');
  });
});
