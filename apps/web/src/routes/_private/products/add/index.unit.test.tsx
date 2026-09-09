// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const postMock = vi.fn();
vi.mock('@/lib/api/client.api.js', () => ({ post: postMock }));

const navigateMock = vi.fn();
// Mesmo mock mínimo de auth/index.unit.test.tsx/processes/add/index.unit.test.tsx
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

const { ProductAddPage } = await import('./index.js');

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ProductAddPage />
    </QueryClientProvider>,
  );
}

describe('ProductAddPage (T20, spec.md P1 "Cadastro de catálogo"/AC1/AC4)', () => {
  afterEach(() => {
    cleanup();
    postMock.mockReset();
    navigateMock.mockReset();
  });

  it('submits the form via POST /products and navigates back to the listing on success', async () => {
    postMock.mockResolvedValue({
      success: true,
      data: { id: 'p1', name: 'Camiseta', price: 5000, stock: 10, active: true },
    });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Nome'), 'Camiseta');
    await user.type(screen.getByLabelText('Estoque'), '10');
    // MoneyInput (@/components/ui/money-input.js) reformata a máscara a cada
    // keystroke — `fireEvent.change` de uma vez só evita a complexidade de
    // simular digitação char-a-char sobre um input mascarado; "5000" digitado
    // é interpretado como 5000 CENTAVOS (money.helper.ts), ou seja R$50,00.
    fireEvent.change(screen.getByLabelText('Preço'), { target: { value: '5000' } });
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith('/products', {
        name: 'Camiseta',
        sku: '',
        description: '',
        price: 5000,
        stock: 10,
      });
    });
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: '/products' }));
  });

  it('rejects an empty name via createProductSchema (AC4) — validation error shown, POST never called, no navigation', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('name é obrigatório')).toBeInTheDocument();
    expect(postMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("shows the backend's error message on failure, never navigating away from the form", async () => {
    postMock.mockResolvedValue({ success: false, message: 'Não foi possível criar o produto.' });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Nome'), 'Camiseta');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Não foi possível criar o produto.')).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
