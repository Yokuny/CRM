// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Radix Checkbox usa APIs que o jsdom não implementa (ResizeObserver via
// @radix-ui/react-use-size) — mesmo polyfill mínimo já usado em
// dynamic-field.unit.test.tsx (primeiro precedente de teste de um primitive
// Radix neste projeto).
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
// Mesmo mock mínimo de customers/details.unit.test.tsx/processes/details.unit.test.tsx
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

const { ProductDetailsPage } = await import('./details.js');

const catalogPage = {
  items: [
    { id: 'p1', name: 'Camiseta', sku: 'CAM-1', description: 'Camiseta básica', price: 5000, stock: 10, active: true },
    { id: 'p2', name: 'Calça', price: 8000, stock: 3, active: false },
  ],
  total: 2,
};

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ProductDetailsPage />
    </QueryClientProvider>,
  );
}

describe('ProductDetailsPage (T21, spec.md P1 "Cadastro de catálogo"/AC3)', () => {
  afterEach(() => {
    cleanup();
    getMock.mockReset();
    patchMock.mockReset();
    searchMock.mockReset();
  });

  it("loads the catalog and pre-fills the form with the matching Product's current fields (AC3: carrega Product por search.id)", async () => {
    searchMock.mockReturnValue({ id: 'p1' });
    getMock.mockResolvedValue({ success: true, data: catalogPage });

    renderPage();

    expect(await screen.findByLabelText('Nome')).toHaveValue('Camiseta');
    expect(screen.getByLabelText('SKU')).toHaveValue('CAM-1');
    expect(screen.getByLabelText('Estoque')).toHaveValue(10);
    expect(screen.getByRole('checkbox', { name: 'Ativo' })).toBeChecked();
  });

  it('shows an explicit not-found state when no Product in the catalog matches search.id', async () => {
    searchMock.mockReturnValue({ id: 'missing-id' });
    getMock.mockResolvedValue({ success: true, data: catalogPage });

    renderPage();

    expect(await screen.findByText('Nenhum registro encontrado.')).toBeInTheDocument();
  });

  it('edits stock and active, submits via PATCH /products/:id, and re-fills the form with what the server returned (AC3)', async () => {
    searchMock.mockReturnValue({ id: 'p2' });
    getMock.mockResolvedValue({ success: true, data: catalogPage });
    patchMock.mockResolvedValue({
      success: true,
      data: { id: 'p2', name: 'Calça', price: 8000, stock: 15, active: true },
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText('Nome');

    // fireEvent.change de uma vez só (não user.clear + user.type):
    // "Estoque" é um input numérico CONTROLADO (value={field.value}) — digitar
    // char-a-char sobre um valor controlado que já mostra "0" concatenaria
    // dígitos de forma imprevisível entre re-renders; setar o valor final
    // atomicamente é o mesmo raciocínio já usado no MoneyInput mascarado de
    // products/add/index.unit.test.tsx.
    fireEvent.change(screen.getByLabelText('Estoque'), { target: { value: '15' } });
    await user.click(screen.getByRole('checkbox', { name: 'Ativo' }));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(patchMock).toHaveBeenCalledWith('/products/p2', {
        name: 'Calça',
        sku: '',
        description: '',
        price: 8000,
        stock: 15,
        active: true,
      });
    });
    expect(await screen.findByLabelText('Estoque')).toHaveValue(15);
    expect(screen.getByRole('checkbox', { name: 'Ativo' })).toBeChecked();
  });

  it("shows the backend's error message on failure, keeping the form's current (unsaved) values intact", async () => {
    searchMock.mockReturnValue({ id: 'p1' });
    getMock.mockResolvedValue({ success: true, data: catalogPage });
    patchMock.mockResolvedValue({ success: false, message: 'Produto não encontrado' });
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText('Nome');

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Produto não encontrado')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome')).toHaveValue('Camiseta');
  });
});
