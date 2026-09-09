// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const getMock = vi.fn();
const postMock = vi.fn();
vi.mock('@/lib/api/client.api.js', () => ({ get: getMock, post: postMock }));

const navigateMock = vi.fn();
const searchMock = vi.fn();
// Mesmo mock mínimo de products/index.unit.test.tsx (apps/web/CLAUDE.md —
// padrão obrigatório de teste de rota, sem <RouterProvider> real).
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useSearch: () => searchMock(),
    useLocation: () => ({ pathname: '/' }),
    useMatches: () => [],
    useRouter: () => ({ history: { back: vi.fn() } }),
    Link: ({ to, children }: { to: string; children?: ReactNode }) => <a href={to}>{children}</a>,
  };
});

const { OrdersIndexPage } = await import('./index.js');

const defaultSearch = { status: 'pending_approval', page: 1, limit: 20, conversation: '' };

const PENDING_ORDER = {
  id: 'o1',
  conversation: 'c1',
  customer: 'cust1',
  customerName: 'Ana',
  items: [{ product: 'p1', name: 'Camiseta', unitPrice: 1000, quantity: 2 }],
  totalPrice: 2000,
  status: 'pending_approval',
  idempotencyKey: 'k1',
  customerConfirmed: true,
  operatorApproved: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const CONFIRMED_ORDER = { ...PENDING_ORDER, id: 'o2', status: 'confirmed' };

// spec.md P2 AC1 (PAY-15/T31) — paymentStatus é opcional em OrderRecord;
// estes 3 Orders confirmados representam os 3 valores com estilo semântico
// próprio no texto literal da AC (pending/paid/expired).
const ORDER_WITH_PENDING_PAYMENT = { ...CONFIRMED_ORDER, id: 'o3', paymentStatus: 'pending' };
const ORDER_WITH_PAID_PAYMENT = { ...CONFIRMED_ORDER, id: 'o4', paymentStatus: 'paid' };
const ORDER_WITH_EXPIRED_PAYMENT = { ...CONFIRMED_ORDER, id: 'o5', paymentStatus: 'expired' };

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <OrdersIndexPage />
    </QueryClientProvider>,
  );
}

describe('OrdersIndexPage (T23, spec.md P1 "Operador aprova ou rejeita um pedido pendente"/AC1/AC2)', () => {
  afterEach(() => {
    cleanup();
    getMock.mockReset();
    postMock.mockReset();
    navigateMock.mockReset();
    searchMock.mockReset();
  });

  it('AC1: loads GET /orders filtered by the default status (pending_approval) and shows Aprovar/Rejeitar for that row', async () => {
    searchMock.mockReturnValue(defaultSearch);
    getMock.mockResolvedValue({ success: true, data: { items: [PENDING_ORDER], total: 1 } });

    renderPage();

    await waitFor(() => expect(getMock).toHaveBeenCalledWith('/orders?status=pending_approval&page=1&limit=20'));
    expect(await screen.findByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('R$ 20,00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aprovar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rejeitar' })).toBeInTheDocument();
  });

  it('AC2: a confirmed Order (history view) never shows Aprovar/Rejeitar — only pending_approval rows do', async () => {
    searchMock.mockReturnValue({ ...defaultSearch, status: 'confirmed' });
    getMock.mockResolvedValue({ success: true, data: { items: [CONFIRMED_ORDER], total: 1 } });

    renderPage();

    expect(await screen.findByText('Ana')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rejeitar' })).not.toBeInTheDocument();
  });

  it("AC1: switching the status filter (tab) updates the URL search — reused as the same screen's history view", async () => {
    searchMock.mockReturnValue(defaultSearch);
    getMock.mockResolvedValue({ success: true, data: { items: [PENDING_ORDER], total: 1 } });
    const user = userEvent.setup();

    renderPage();
    await screen.findByText('Ana');

    await user.click(screen.getByRole('button', { name: 'Confirmado' }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalled());
    const searchUpdater = navigateMock.mock.calls[0][0].search;
    expect(searchUpdater(defaultSearch)).toEqual({ ...defaultSearch, status: 'confirmed', page: 1 });
  });

  it('AC4: clicking Aprovar calls POST /orders/:id/approve', async () => {
    searchMock.mockReturnValue(defaultSearch);
    getMock.mockResolvedValue({ success: true, data: { items: [PENDING_ORDER], total: 1 } });
    postMock.mockResolvedValue({ success: true, data: { ...PENDING_ORDER, status: 'confirmed' } });
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Aprovar' }));

    await waitFor(() => expect(postMock).toHaveBeenCalledWith('/orders/o1/approve'));
  });

  it('AC6: clicking Rejeitar calls POST /orders/:id/reject', async () => {
    searchMock.mockReturnValue(defaultSearch);
    getMock.mockResolvedValue({ success: true, data: { items: [PENDING_ORDER], total: 1 } });
    postMock.mockResolvedValue({ success: true, data: { ...PENDING_ORDER, status: 'rejected' } });
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Rejeitar' }));

    await waitFor(() => expect(postMock).toHaveBeenCalledWith('/orders/o1/reject', { reason: undefined }));
  });

  it('shows an explicit empty state (never a blank table) when the filtered status has no Orders', async () => {
    searchMock.mockReturnValue(defaultSearch);
    getMock.mockResolvedValue({ success: true, data: { items: [], total: 0 } });

    renderPage();

    expect(await screen.findByText('Nenhum registro encontrado.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  describe('payment status badge (spec.md P2 AC1, PAY-15/T31)', () => {
    it('renders a distinct badge for a pending Payment', async () => {
      searchMock.mockReturnValue({ ...defaultSearch, status: 'confirmed' });
      getMock.mockResolvedValue({ success: true, data: { items: [ORDER_WITH_PENDING_PAYMENT], total: 1 } });

      renderPage();

      expect(await screen.findByText('Pagamento pendente')).toBeInTheDocument();
    });

    it('renders a distinct badge for a paid Payment', async () => {
      searchMock.mockReturnValue({ ...defaultSearch, status: 'confirmed' });
      getMock.mockResolvedValue({ success: true, data: { items: [ORDER_WITH_PAID_PAYMENT], total: 1 } });

      renderPage();

      expect(await screen.findByText('Pago')).toBeInTheDocument();
    });

    it('renders a distinct badge for an expired Payment', async () => {
      searchMock.mockReturnValue({ ...defaultSearch, status: 'confirmed' });
      getMock.mockResolvedValue({ success: true, data: { items: [ORDER_WITH_EXPIRED_PAYMENT], total: 1 } });

      renderPage();

      expect(await screen.findByText('Cobrança expirada')).toBeInTheDocument();
    });

    it('renders nothing in the payment column (no empty badge) when the Order has no Payment', async () => {
      searchMock.mockReturnValue(defaultSearch);
      getMock.mockResolvedValue({ success: true, data: { items: [PENDING_ORDER], total: 1 } });

      renderPage();

      await screen.findByText('Ana');
      expect(screen.queryByText('Pagamento pendente')).not.toBeInTheDocument();
      expect(screen.queryByText('Pago')).not.toBeInTheDocument();
      expect(screen.queryByText('Cobrança expirada')).not.toBeInTheDocument();
    });
  });

  it("PAY-15/T29: the payment_expired status filter exists and navigates with status:'payment_expired' when clicked", async () => {
    searchMock.mockReturnValue(defaultSearch);
    getMock.mockResolvedValue({ success: true, data: { items: [PENDING_ORDER], total: 1 } });
    const user = userEvent.setup();

    renderPage();
    await screen.findByText('Ana');

    await user.click(screen.getByRole('button', { name: 'Pagamento expirado' }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalled());
    const searchUpdater = navigateMock.mock.calls[0][0].search;
    expect(searchUpdater(defaultSearch)).toEqual({ ...defaultSearch, status: 'payment_expired', page: 1 });
  });
});
