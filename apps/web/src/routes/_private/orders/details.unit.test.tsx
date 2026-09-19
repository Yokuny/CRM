// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const getMock = vi.fn();
const postMock = vi.fn();
vi.mock('@/lib/api/client.api.js', () => ({ get: getMock, post: postMock }));

const searchMock = vi.fn();
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useSearch: () => searchMock(),
    useLocation: () => ({ pathname: '/' }),
    useMatches: () => [],
    useRouter: () => ({ history: { back: vi.fn() } }),
    Link: ({ to, search, children }: { to: string; search?: Record<string, string>; children?: ReactNode }) => (
      <a href={search ? `${to}?${new URLSearchParams(search).toString()}` : to}>{children}</a>
    ),
  };
});

const { OrderDetailsPage } = await import('./details.js');
const { toast } = await import('sonner');

const PENDING_ORDER = {
  id: 'o1',
  conversation: 'c1',
  customer: 'cust1',
  customerName: 'Ana Souza',
  customerPhone: '5511999990000',
  items: [
    { product: 'p1', name: 'Sérum Vitamina C', unitPrice: 18990, quantity: 2 },
    { product: 'p2', name: 'Protetor Solar', unitPrice: 8990, quantity: 1 },
  ],
  totalPrice: 46970,
  status: 'pending_approval',
  idempotencyKey: 'k1',
  customerConfirmed: true,
  operatorApproved: false,
  confirmFailureReason: 'Estoque insuficiente para o produto "Protetor Solar"',
  createdAt: '2026-09-18T15:30:00.000Z',
  updatedAt: '2026-09-18T15:30:00.000Z',
};

const CONFIRMED_ORDER = {
  ...PENDING_ORDER,
  status: 'confirmed',
  operatorApproved: true,
  approvedBy: 'u1',
  approvedByName: 'Marcos Vieira',
  approvedAt: '2026-09-18T16:00:00.000Z',
  confirmFailureReason: undefined,
  paymentStatus: 'pending',
  payment: {
    status: 'pending',
    value: 46970,
    billingType: 'PIX',
    pixPayload: '00020126pix',
    createdAt: '2026-09-18T16:00:05.000Z',
    updatedAt: '2026-09-18T16:00:05.000Z',
  },
};

function renderPage(order: unknown) {
  searchMock.mockReturnValue({ id: 'o1' });
  getMock.mockImplementation((path: string) => {
    if (path === '/orders/o1') {
      return Promise.resolve(order ? { success: true, data: order } : { success: false, message: 'Não encontrado.' });
    }
    throw new Error(`unexpected path ${path}`);
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <OrderDetailsPage />
    </QueryClientProvider>,
  );
}

describe('OrderDetailsPage', () => {
  afterEach(() => {
    cleanup();
    getMock.mockReset();
    postMock.mockReset();
    searchMock.mockReset();
    vi.mocked(toast.error).mockReset();
  });

  it('shows customer, status, the pending issue, items with subtotals/total and the conversation link', async () => {
    renderPage(PENDING_ORDER);

    expect((await screen.findByText('Ana Souza')).closest('a')).toHaveAttribute('href', '/customers/details?id=cust1');
    expect(screen.getByText('5511999990000')).toBeInTheDocument();
    expect(screen.getByText('Pendente')).toBeInTheDocument();
    expect(screen.getByText('Estoque insuficiente para o produto "Protetor Solar"')).toBeInTheDocument();
    expect(screen.getByText('18 set 2026 · 12:30')).toBeInTheDocument();

    const table = within(screen.getByRole('table'));
    expect(table.getByText('Sérum Vitamina C')).toBeInTheDocument();
    expect(table.getByText('R$ 379,80')).toBeInTheDocument();
    expect(table.getByText('R$ 469,70')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir conversa' })).toHaveAttribute('href', '/inbox?id=c1');
  });

  it('a pending order can be approved from the details (POST /orders/:id/approve)', async () => {
    postMock.mockResolvedValue({ success: true, data: { ...PENDING_ORDER, status: 'confirmed' } });
    const user = userEvent.setup();
    renderPage(PENDING_ORDER);

    await user.click(await screen.findByRole('button', { name: 'Aprovar' }));

    await waitFor(() => expect(postMock).toHaveBeenCalledWith('/orders/o1/approve'));
  });

  it('rejecting asks for confirmation and sends the optional reason', async () => {
    postMock.mockResolvedValue({ success: true, data: { ...PENDING_ORDER, status: 'rejected' } });
    const user = userEvent.setup();
    renderPage(PENDING_ORDER);

    await user.click(await screen.findByRole('button', { name: 'Rejeitar' }));
    const panel = within(screen.getByTestId('reject-order'));
    expect(postMock).not.toHaveBeenCalled();
    await user.type(panel.getByLabelText('Motivo'), 'Cliente desistiu');
    await user.click(panel.getByRole('button', { name: 'Rejeitar' }));

    await waitFor(() => expect(postMock).toHaveBeenCalledWith('/orders/o1/reject', { reason: 'Cliente desistiu' }));
  });

  it('a confirmed order shows who approved it and the payment, without approve/reject actions', async () => {
    renderPage(CONFIRMED_ORDER);

    expect(await screen.findByText('Marcos Vieira · 18 set 2026 · 13:00')).toBeInTheDocument();
    expect(screen.getByText('PIX')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copiar código PIX' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rejeitar' })).not.toBeInTheDocument();
  });

  it('shows the empty state for an order that does not exist or belongs to another tenant', async () => {
    renderPage(null);

    expect(await screen.findByText('Nenhum registro encontrado.')).toBeInTheDocument();
  });
});
