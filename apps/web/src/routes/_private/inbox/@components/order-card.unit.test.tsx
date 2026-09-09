// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const getMock = vi.fn();
const postMock = vi.fn();
vi.mock('../../../../lib/api/client.api.js', () => ({ get: getMock, post: postMock }));

const { OrderCard } = await import('./order-card.js');
const { toast } = await import('sonner');

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

function renderCard(
  conversationId = 'c1',
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <OrderCard conversationId={conversationId} />
      </QueryClientProvider>,
    ),
  };
}

describe('OrderCard (T24, spec.md P1 "Operador aprova ou rejeita um pedido pendente"/AC3)', () => {
  afterEach(() => {
    cleanup();
    getMock.mockReset();
    postMock.mockReset();
    vi.mocked(toast.error).mockReset();
  });

  it('Done when: renders nothing when this Conversation has no pending Order', async () => {
    getMock.mockResolvedValue({ success: true, data: { items: [], total: 0 } });

    const { container } = renderCard('c1');

    await waitFor(() => expect(getMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing before the query resolves (no loading flash for this secondary widget)', () => {
    getMock.mockReturnValue(new Promise(() => {})); // never resolves during this test

    const { container } = renderCard('c1');

    expect(container).toBeEmptyDOMElement();
  });

  it('AC3: uses ordersQuery({conversation, status:pending_approval}) and shows the summary + Aprovar/Rejeitar when a pending Order exists', async () => {
    getMock.mockResolvedValue({ success: true, data: { items: [PENDING_ORDER], total: 1 } });

    renderCard('c1');

    await waitFor(() =>
      expect(getMock).toHaveBeenCalledWith('/orders?status=pending_approval&conversation=c1&limit=1'),
    );
    expect(await screen.findByText('R$ 20,00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aprovar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rejeitar' })).toBeInTheDocument();
  });

  it('AC4: clicking Aprovar calls POST /orders/:id/approve for this Order', async () => {
    getMock.mockResolvedValue({ success: true, data: { items: [PENDING_ORDER], total: 1 } });
    postMock.mockResolvedValue({ success: true, data: { ...PENDING_ORDER, status: 'confirmed' } });
    const user = userEvent.setup();

    renderCard('c1');
    await user.click(await screen.findByRole('button', { name: 'Aprovar' }));

    await waitFor(() => expect(postMock).toHaveBeenCalledWith('/orders/o1/approve'));
  });

  it('AC6: clicking Rejeitar calls POST /orders/:id/reject for this Order', async () => {
    getMock.mockResolvedValue({ success: true, data: { items: [PENDING_ORDER], total: 1 } });
    postMock.mockResolvedValue({ success: true, data: { ...PENDING_ORDER, status: 'rejected' } });
    const user = userEvent.setup();

    renderCard('c1');
    await user.click(await screen.findByRole('button', { name: 'Rejeitar' }));

    await waitFor(() => expect(postMock).toHaveBeenCalledWith('/orders/o1/reject', { reason: undefined }));
  });

  it('design.md decisão 5: after approving, the card disappears without a manual refresh (invalidated query refetches empty)', async () => {
    // 1ª chamada (carga inicial): há um Order pendente. QUALQUER chamada
    // seguinte (o refetch automático disparado por invalidateQueries no
    // onSuccess de approveOrderMutation) já não encontra mais nenhum —
    // configurado ANTES do clique, porque o refetch pode disparar antes que
    // o teste tenha a chance de trocar o mock depois do fato.
    getMock.mockResolvedValueOnce({ success: true, data: { items: [PENDING_ORDER], total: 1 } });
    getMock.mockResolvedValue({ success: true, data: { items: [], total: 0 } });
    postMock.mockResolvedValue({ success: true, data: { ...PENDING_ORDER, status: 'confirmed' } });
    const user = userEvent.setup();

    const { container } = renderCard('c1');
    await user.click(await screen.findByRole('button', { name: 'Aprovar' }));

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('shows a toast when approving fails', async () => {
    getMock.mockResolvedValue({ success: true, data: { items: [PENDING_ORDER], total: 1 } });
    postMock.mockResolvedValue({ success: false, message: 'Order já está em estado terminal' });
    const user = userEvent.setup();

    renderCard('c1');
    await user.click(await screen.findByRole('button', { name: 'Aprovar' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Order já está em estado terminal'));
  });
});
