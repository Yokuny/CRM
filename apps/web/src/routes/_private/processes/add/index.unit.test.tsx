// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Radix Select chama APIs que o jsdom não implementa — mesmo polyfill mínimo
// de dynamic-field.unit.test.tsx (T14), primeiro precedente de um teste de
// rota usando o Select ported.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
  // biome-ignore lint/suspicious/noExplicitAny: polyfill mínimo, jsdom não implementa ResizeObserver
  (global as any).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const getMock = vi.fn();
const postMock = vi.fn();
vi.mock('../../../../lib/api/client.api.js', () => ({ get: getMock, post: postMock }));

const searchMock = vi.fn();
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useSearch: () => searchMock(),
    useLocation: () => ({ pathname: '/' }),
    useMatches: () => [],
    useRouter: () => ({ history: { back: vi.fn() } }),
    Link: ({ to, children }: { to: string; children?: ReactNode }) => <a href={to}>{children}</a>,
  };
});

const { ProcessAddPage } = await import('./index.js');

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProcessAddPage />
    </QueryClientProvider>,
  );
}

describe('ProcessAddPage (T25 — WEB-07)', () => {
  afterEach(() => {
    cleanup();
    getMock.mockReset();
    postMock.mockReset();
    searchMock.mockReset();
  });

  it('WEB-07 AC1: lists non-archived process templates by label; archived ones are never selectable', async () => {
    searchMock.mockReturnValue({ customerId: 'c1' });
    getMock.mockResolvedValue({
      success: true,
      data: {
        items: [
          { key: 'compra', label: 'Compra', archived: false },
          { key: 'venda', label: 'Venda', archived: true },
        ],
      },
    });
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole('combobox'));

    expect(await screen.findByRole('option', { name: 'Compra' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Venda' })).not.toBeInTheDocument();
  });

  it('WEB-07 AC2: shows an explicit message and blocks the attempt when there are zero available (non-archived) templates', async () => {
    searchMock.mockReturnValue({ customerId: 'c1' });
    getMock.mockResolvedValue({ success: true, data: { items: [{ key: 'venda', label: 'Venda', archived: true }] } });

    renderPage();

    expect(await screen.findByText('Nenhum registro encontrado.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument();
  });

  it('WEB-07 AC3: a valid selection calls POST /processes with templateKey+customerId and shows the returned initial stage', async () => {
    searchMock.mockReturnValue({ customerId: 'c1' });
    getMock.mockResolvedValue({
      success: true,
      data: { items: [{ key: 'compra', label: 'Compra', archived: false }] },
    });
    postMock.mockResolvedValue({
      success: true,
      data: { id: 'p1', customer: 'c1', template: 't1', templateVersion: 1, stage: 'aberto', values: {} },
    });
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Compra' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith('/processes', { templateKey: 'compra', customerId: 'c1' }),
    );
    expect(await screen.findByText('aberto')).toBeInTheDocument();
    expect(await screen.findByText('Processo criado com sucesso.')).toBeInTheDocument();
  });

  it('WEB-07 AC4: a server rejection shows the error and never navigates/renders as if the Process had been created', async () => {
    searchMock.mockReturnValue({ customerId: 'c1' });
    getMock.mockResolvedValue({
      success: true,
      data: { items: [{ key: 'compra', label: 'Compra', archived: false }] },
    });
    postMock.mockResolvedValue({ success: false, message: 'Template arquivado' });
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Compra' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Template arquivado');
    expect(screen.queryByText('Processo criado com sucesso.')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });
});
