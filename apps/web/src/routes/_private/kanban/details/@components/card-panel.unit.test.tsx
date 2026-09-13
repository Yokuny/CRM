// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CardRecord } from '@/query/board.js';

// Radix Select chama APIs que o jsdom não implementa — mesmo polyfill mínimo
// de appointment-panel.unit.test.tsx/block-panel.unit.test.tsx.
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

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const getMock = vi.fn();
const postMock = vi.fn();
const patchMock = vi.fn();
const delMock = vi.fn();
vi.mock('@/lib/api/client.api.js', () => ({ get: getMock, post: postMock, patch: patchMock, del: delMock }));

const { toast } = await import('sonner');
const { CardPanel } = await import('./card-panel.js');

const COLUMN_ID = '507f1f77bcf86cd799439001';
const CUSTOMER_ID = '507f1f77bcf86cd799439012';
const PROCESS_ID = '507f1f77bcf86cd799439013';
const CUSTOMERS = { items: [{ id: CUSTOMER_ID, name: 'Maria Cliente', phone: '5511999999999' }], total: 1 };

const mockLookups = () => {
  getMock.mockImplementation((path: string) => {
    if (path.startsWith('/customers')) return Promise.resolve({ success: true, data: CUSTOMERS });
    return Promise.resolve({ success: true, data: { items: [], total: 0 } });
  });
};

function renderPanel(props: { boardId: string; columnId?: string; card?: CardRecord; onClose?: () => void }) {
  const queryClient = new QueryClient();
  const onClose = props.onClose ?? vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <CardPanel onClose={onClose} boardId={props.boardId} columnId={props.columnId} card={props.card} />
    </QueryClientProvider>,
  );
  return { onClose };
}

const existingCard: CardRecord = {
  id: 'card1',
  board: 'b1',
  column: COLUMN_ID,
  title: 'Ligar para o cliente',
  position: 0,
  createdAt: '',
  updatedAt: '',
};

describe('CardPanel — create mode (T18, spec.md KAN-13/KAN-14)', () => {
  afterEach(() => {
    cleanup();
    getMock.mockReset();
    postMock.mockReset();
    patchMock.mockReset();
    delMock.mockReset();
    vi.mocked(toast.error).mockReset();
  });

  it('renders inline (not in a dialog role) — no [role="dialog"] anywhere in the tree', async () => {
    mockLookups();
    renderPanel({ boardId: 'b1', columnId: COLUMN_ID });
    await screen.findByLabelText('Título');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('creates a card with only title, fixed to the given column (KAN-13)', async () => {
    mockLookups();
    postMock.mockResolvedValue({ success: true, data: existingCard });
    const user = userEvent.setup();
    const { onClose } = renderPanel({ boardId: 'b1', columnId: COLUMN_ID });

    await user.type(await screen.findByLabelText('Título'), 'Ligar para o cliente');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith('/boards/b1/cards', {
        title: 'Ligar para o cliente',
        description: '',
        column: COLUMN_ID,
        customer: undefined,
        process: undefined,
        order: undefined,
        assignee: undefined,
      }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('creates a card with the customer selected and process/assignee ids typed in (KAN-14 happy path)', async () => {
    mockLookups();
    postMock.mockResolvedValue({ success: true, data: existingCard });
    const user = userEvent.setup();
    renderPanel({ boardId: 'b1', columnId: COLUMN_ID });

    await user.type(await screen.findByLabelText('Título'), 'Card completo');
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Maria Cliente' }));
    await user.type(screen.getByLabelText('Processo'), PROCESS_ID);
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith(
        '/boards/b1/cards',
        expect.objectContaining({ title: 'Card completo', customer: CUSTOMER_ID, process: PROCESS_ID }),
      ),
    );
  });

  it('rejects an empty title via createCardSchema — POST never called', async () => {
    mockLookups();
    const user = userEvent.setup();
    renderPanel({ boardId: 'b1', columnId: COLUMN_ID });
    await screen.findByLabelText('Título');

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('title é obrigatório')).toBeInTheDocument();
    expect(postMock).not.toHaveBeenCalled();
  });

  it('shows a toast when the create mutation fails (e.g. invalid reference, KAN-14)', async () => {
    mockLookups();
    postMock.mockResolvedValue({ success: false, message: 'customer não encontrado ou de outro tenant' });
    const user = userEvent.setup();
    renderPanel({ boardId: 'b1', columnId: COLUMN_ID });

    await user.type(await screen.findByLabelText('Título'), 'Card');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('customer não encontrado ou de outro tenant'));
  });

  it('calls onClose when the explicit close button is clicked, without submitting', async () => {
    mockLookups();
    const user = userEvent.setup();
    const { onClose } = renderPanel({ boardId: 'b1', columnId: COLUMN_ID });
    await screen.findByLabelText('Título');

    await user.click(screen.getByRole('button', { name: 'Fechar' }));

    expect(onClose).toHaveBeenCalled();
    expect(postMock).not.toHaveBeenCalled();
  });
});

describe('CardPanel — edit mode (T18, spec.md KAN-16/KAN-17)', () => {
  afterEach(() => {
    cleanup();
    getMock.mockReset();
    postMock.mockReset();
    patchMock.mockReset();
    delMock.mockReset();
    vi.mocked(toast.error).mockReset();
  });

  it('pre-fills the form with the existing card and never shows a column field (KAN-16)', async () => {
    mockLookups();
    renderPanel({ boardId: 'b1', card: existingCard });

    expect(await screen.findByDisplayValue('Ligar para o cliente')).toBeInTheDocument();
    expect(screen.queryByLabelText(/coluna/i)).not.toBeInTheDocument();
  });

  it('saves title/description/reference edits via PATCH /boards/:id/cards/:cardId, without touching the column (KAN-16)', async () => {
    mockLookups();
    patchMock.mockResolvedValue({ success: true, data: { ...existingCard, title: 'Editado' } });
    const user = userEvent.setup();
    const { onClose } = renderPanel({ boardId: 'b1', card: existingCard });

    const titleInput = await screen.findByLabelText('Título');
    await user.clear(titleInput);
    await user.type(titleInput, 'Editado');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith('/boards/b1/cards/card1', expect.objectContaining({ title: 'Editado' })),
    );
    const [, body] = patchMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(body).not.toHaveProperty('column');
    expect(body).not.toHaveProperty('position');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('removes the card via deleteCardMutation (DELETE /boards/:id/cards/:cardId) — KAN-17', async () => {
    mockLookups();
    delMock.mockResolvedValue({ success: true, message: 'Card removido com sucesso.' });
    const user = userEvent.setup();
    const { onClose } = renderPanel({ boardId: 'b1', card: existingCard });

    await user.click(await screen.findByRole('button', { name: 'Remover card' }));

    await waitFor(() => expect(delMock).toHaveBeenCalledWith('/boards/b1/cards/card1'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('shows a toast when the delete mutation fails', async () => {
    mockLookups();
    delMock.mockResolvedValue({ success: false, message: 'Card não encontrado' });
    const user = userEvent.setup();
    renderPanel({ boardId: 'b1', card: existingCard });

    await user.click(await screen.findByRole('button', { name: 'Remover card' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Card não encontrado'));
  });
});
