// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BoardColumnRecord } from '@/query/board.js';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const postMock = vi.fn();
const patchMock = vi.fn();
const delMock = vi.fn();
vi.mock('@/lib/api/client.api.js', () => ({ post: postMock, patch: patchMock, del: delMock }));

const { toast } = await import('sonner');
const { ColumnManagerPanel } = await import('./column-manager-panel.js');

const BOARD_ID = 'b1';
const TWO_COLUMNS: BoardColumnRecord[] = [
  { id: 'col-a', label: 'A fazer', order: 0 },
  { id: 'col-b', label: 'Feito', order: 1 },
];
const ONE_COLUMN: BoardColumnRecord[] = [{ id: 'col-a', label: 'Única', order: 0 }];

function renderPanel(columns: BoardColumnRecord[], onClose = vi.fn()) {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <ColumnManagerPanel onClose={onClose} boardId={BOARD_ID} columns={columns} />
    </QueryClientProvider>,
  );
  return { onClose };
}

describe('ColumnManagerPanel (T19, spec.md P1 "Gerenciar colunas do board"/KAN-07..12/KAN-29)', () => {
  afterEach(() => {
    cleanup();
    postMock.mockReset();
    patchMock.mockReset();
    delMock.mockReset();
    vi.mocked(toast.error).mockReset();
  });

  it('renders inline (not in a dialog role) — no [role="dialog"] anywhere in the tree', () => {
    renderPanel(TWO_COLUMNS);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('adds a new column via POST /boards/:id/columns and clears the input on success (KAN-07)', async () => {
    postMock.mockResolvedValue({ success: true, data: { id: BOARD_ID, name: 'Board', columns: [], updatedAt: '' } });
    const user = userEvent.setup();
    renderPanel(TWO_COLUMNS);

    const inputs = screen.getAllByLabelText('Nome da coluna');
    const newColumnInput = inputs[inputs.length - 1] as HTMLElement;
    await user.type(newColumnInput, 'Em revisão');
    await user.click(screen.getByRole('button', { name: 'Adicionar coluna' }));

    await waitFor(() => expect(postMock).toHaveBeenCalledWith(`/boards/${BOARD_ID}/columns`, { label: 'Em revisão' }));
    await waitFor(() => expect(newColumnInput).toHaveValue(''));
  });

  it('renames a column via PATCH /boards/:id/columns/:columnId (KAN-08)', async () => {
    patchMock.mockResolvedValue({ success: true, data: { id: BOARD_ID, name: 'Board', columns: [], updatedAt: '' } });
    const user = userEvent.setup();
    renderPanel(TWO_COLUMNS);

    const labelInput = screen.getByDisplayValue('A fazer');
    await user.clear(labelInput);
    await user.type(labelInput, 'Recebido');
    await user.click(screen.getAllByRole('button', { name: 'Salvar' })[0] as HTMLElement);

    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith('/boards/b1/columns/col-a', { label: 'Recebido', color: undefined }),
    );
  });

  it('sets a hex color for a column via the same update mutation (KAN-29)', async () => {
    patchMock.mockResolvedValue({ success: true, data: { id: BOARD_ID, name: 'Board', columns: [], updatedAt: '' } });
    const user = userEvent.setup();
    renderPanel(TWO_COLUMNS);

    const colorInputs = screen.getAllByLabelText('Cor');
    await user.type(colorInputs[0] as HTMLElement, '#FF0000');
    await user.click(screen.getAllByRole('button', { name: 'Salvar' })[0] as HTMLElement);

    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith('/boards/b1/columns/col-a', { label: 'A fazer', color: '#FF0000' }),
    );
  });

  it('moving the first column down calls PATCH /boards/:id/columns/reorder with the new column order (KAN-09)', async () => {
    patchMock.mockResolvedValue({ success: true, data: { id: BOARD_ID, name: 'Board', columns: [], updatedAt: '' } });
    const user = userEvent.setup();
    renderPanel(TWO_COLUMNS);

    await user.click(screen.getAllByRole('button', { name: 'Mover para baixo' })[0] as HTMLElement);

    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith('/boards/b1/columns/reorder', { columnIds: ['col-b', 'col-a'] }),
    );
  });

  it('removes an empty column via DELETE when the board has more than 1 column (KAN-12)', async () => {
    delMock.mockResolvedValue({ success: true, data: { id: BOARD_ID, name: 'Board', columns: [], updatedAt: '' } });
    const user = userEvent.setup();
    renderPanel(TWO_COLUMNS);

    await user.click(screen.getAllByRole('button', { name: 'Remover' })[0] as HTMLElement);

    await waitFor(() => expect(delMock).toHaveBeenCalledWith('/boards/b1/columns/col-a'));
  });

  it('disables the remove button for the last remaining column, even empty (KAN-11) — never calls the API', async () => {
    const user = userEvent.setup();
    renderPanel(ONE_COLUMN);

    const removeButton = screen.getByRole('button', { name: 'Remover' });
    expect(removeButton).toBeDisabled();

    await user.click(removeButton);
    expect(delMock).not.toHaveBeenCalled();
  });

  it('shows a toast (without crashing) when removal is rejected because the column still has cards (KAN-10)', async () => {
    delMock.mockResolvedValue({ success: false, message: 'A coluna precisa estar vazia para ser removida' });
    const user = userEvent.setup();
    renderPanel(TWO_COLUMNS);

    await user.click(screen.getAllByRole('button', { name: 'Remover' })[0] as HTMLElement);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('A coluna precisa estar vazia para ser removida'));
    // A tela continua íntegra — as duas colunas originais ainda estão visíveis.
    expect(screen.getByDisplayValue('A fazer')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Feito')).toBeInTheDocument();
  });

  it('calls onClose when the explicit close button is clicked', async () => {
    const user = userEvent.setup();
    const { onClose } = renderPanel(TWO_COLUMNS);

    await user.click(screen.getByRole('button', { name: 'Fechar' }));

    expect(onClose).toHaveBeenCalled();
  });
});
