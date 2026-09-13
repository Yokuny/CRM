import type { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const postMock = vi.fn();
const patchMock = vi.fn();
const delMock = vi.fn();
vi.mock('../lib/api/client.api.js', () => ({ get: getMock, post: postMock, patch: patchMock, del: delMock }));

const {
  boardsQuery,
  boardQuery,
  boardCardsQuery,
  createBoardMutation,
  updateBoardMutation,
  deleteBoardMutation,
  addColumnMutation,
  updateColumnMutation,
  reorderColumnsMutation,
  removeColumnMutation,
  createCardMutation,
  updateCardMutation,
  moveCardMutation,
  deleteCardMutation,
  boardKeys,
} = await import('./board.js');

const fakeQueryClient = (): QueryClient & { invalidateQueries: ReturnType<typeof vi.fn> } =>
  ({ invalidateQueries: vi.fn() }) as unknown as QueryClient & { invalidateQueries: ReturnType<typeof vi.fn> };

// TanStack Query 5's `MutationFunction` exige um 2º parâmetro de contexto
// que nenhuma `mutationFn` daqui realmente lê — mesmo raciocínio de
// query/professional.unit.test.ts.
const fakeMutationContext = {} as never;

const BOARD_RECORD = {
  id: 'b1',
  name: 'Cobranças em atraso',
  columns: [{ id: 'c1', label: 'A fazer', order: 0 }],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const CARD_RECORD = {
  id: 'card1',
  board: 'b1',
  column: 'c1',
  title: 'Ligar para o cliente',
  position: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('boardsQuery (T14, spec.md KAN-03)', () => {
  it('calls GET /boards and resolves with the list on success', async () => {
    const data = [{ ...BOARD_RECORD, cardCount: 2 }];
    getMock.mockResolvedValueOnce({ success: true, data });

    const result = await boardsQuery().queryFn?.({} as never);

    expect(getMock).toHaveBeenCalledWith('/boards');
    expect(result).toEqual(data);
  });

  it('throws with the backend message when success:false', async () => {
    getMock.mockResolvedValueOnce({ success: false, message: 'Não foi possível carregar os boards.' });

    await expect(boardsQuery().queryFn?.({} as never)).rejects.toThrow('Não foi possível carregar os boards.');
  });
});

describe('boardQuery (T14, spec.md KAN-06)', () => {
  it('calls GET /boards/:id and resolves with the record on success', async () => {
    getMock.mockResolvedValueOnce({ success: true, data: BOARD_RECORD });

    const result = await boardQuery('b1').queryFn?.({} as never);

    expect(getMock).toHaveBeenCalledWith('/boards/b1');
    expect(result).toEqual(BOARD_RECORD);
  });

  it('throws with the backend message when the board is not found', async () => {
    getMock.mockResolvedValueOnce({ success: false, message: 'Board não encontrado.' });

    await expect(boardQuery('missing').queryFn?.({} as never)).rejects.toThrow('Board não encontrado.');
  });
});

describe('boardCardsQuery (T14, spec.md KAN-13)', () => {
  it('calls GET /boards/:id/cards and resolves with the list on success', async () => {
    getMock.mockResolvedValueOnce({ success: true, data: [CARD_RECORD] });

    const result = await boardCardsQuery('b1').queryFn?.({} as never);

    expect(getMock).toHaveBeenCalledWith('/boards/b1/cards');
    expect(result).toEqual([CARD_RECORD]);
  });

  it('throws with the backend message when success:false', async () => {
    getMock.mockResolvedValueOnce({ success: false, message: 'Não foi possível carregar os cards.' });

    await expect(boardCardsQuery('b1').queryFn?.({} as never)).rejects.toThrow('Não foi possível carregar os cards.');
  });
});

describe('createBoardMutation (T14, spec.md KAN-01)', () => {
  it('calls POST /boards, resolves with the created board and invalidates the lists cache', async () => {
    postMock.mockResolvedValueOnce({ success: true, data: BOARD_RECORD });
    const queryClient = fakeQueryClient();
    const input = { name: 'Cobranças em atraso', columns: [{ label: 'A fazer' }] };

    const result = await createBoardMutation(queryClient).mutationFn?.(input, fakeMutationContext);
    createBoardMutation(queryClient).onSuccess?.(BOARD_RECORD, input, undefined, { client: queryClient } as never);

    expect(postMock).toHaveBeenCalledWith('/boards', input);
    expect(result).toEqual(BOARD_RECORD);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: boardKeys.lists() });
  });

  it('rejects with the backend message when creation fails (spec.md KAN-02)', async () => {
    postMock.mockResolvedValueOnce({ success: false, message: 'board precisa de ao menos 1 coluna' });

    await expect(
      createBoardMutation(fakeQueryClient()).mutationFn?.({ name: 'Vazio', columns: [] }, fakeMutationContext),
    ).rejects.toThrow('board precisa de ao menos 1 coluna');
  });
});

describe('updateBoardMutation (T14, spec.md KAN-04)', () => {
  it('calls PATCH /boards/:id and invalidates both the lists AND the detail(id) cache', async () => {
    const updated = { ...BOARD_RECORD, description: 'Nova descrição' };
    patchMock.mockResolvedValueOnce({ success: true, data: updated });
    const queryClient = fakeQueryClient();
    const variables = { id: 'b1', data: { description: 'Nova descrição' } };

    const result = await updateBoardMutation(queryClient).mutationFn?.(variables, fakeMutationContext);
    updateBoardMutation(queryClient).onSuccess?.(updated, variables, undefined, { client: queryClient } as never);

    expect(patchMock).toHaveBeenCalledWith('/boards/b1', { description: 'Nova descrição' });
    expect(result).toEqual(updated);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: boardKeys.lists() });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: boardKeys.detail('b1') });
  });

  it('throws with the backend message when the update fails', async () => {
    patchMock.mockResolvedValueOnce({ success: false, message: 'Board não encontrado' });

    await expect(
      updateBoardMutation(fakeQueryClient()).mutationFn?.({ id: 'missing', data: {} }, fakeMutationContext),
    ).rejects.toThrow('Board não encontrado');
  });
});

describe('deleteBoardMutation (T14, spec.md KAN-22)', () => {
  it('calls DELETE /boards/:id and invalidates the lists AND detail(id) cache', async () => {
    delMock.mockResolvedValueOnce({ success: true, message: 'Board removido com sucesso.' });
    const queryClient = fakeQueryClient();

    await deleteBoardMutation(queryClient).mutationFn?.({ id: 'b1' }, fakeMutationContext);
    deleteBoardMutation(queryClient).onSuccess?.(undefined, { id: 'b1' }, undefined, { client: queryClient } as never);

    expect(delMock).toHaveBeenCalledWith('/boards/b1');
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: boardKeys.lists() });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: boardKeys.detail('b1') });
  });

  it('throws with the backend message when deletion fails (spec.md KAN-23, e.g. 403 without admin)', async () => {
    delMock.mockResolvedValueOnce({ success: false, message: 'Você não tem permissão para realizar esta ação' });

    await expect(
      deleteBoardMutation(fakeQueryClient()).mutationFn?.({ id: 'b1' }, fakeMutationContext),
    ).rejects.toThrow('Você não tem permissão para realizar esta ação');
  });
});

describe('addColumnMutation (T14, spec.md KAN-07)', () => {
  it('calls POST /boards/:id/columns and invalidates the board detail cache', async () => {
    postMock.mockResolvedValueOnce({ success: true, data: BOARD_RECORD });
    const queryClient = fakeQueryClient();
    const variables = { boardId: 'b1', data: { label: 'Nova coluna' } };

    const result = await addColumnMutation(queryClient).mutationFn?.(variables, fakeMutationContext);
    addColumnMutation(queryClient).onSuccess?.(BOARD_RECORD, variables, undefined, { client: queryClient } as never);

    expect(postMock).toHaveBeenCalledWith('/boards/b1/columns', { label: 'Nova coluna' });
    expect(result).toEqual(BOARD_RECORD);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: boardKeys.detail('b1') });
  });

  it('throws with the backend message when adding the column fails', async () => {
    postMock.mockResolvedValueOnce({ success: false, message: 'Board não encontrado' });

    await expect(
      addColumnMutation(fakeQueryClient()).mutationFn?.({ boardId: 'b1', data: { label: 'X' } }, fakeMutationContext),
    ).rejects.toThrow('Board não encontrado');
  });
});

describe('updateColumnMutation (T14, spec.md KAN-08/KAN-29)', () => {
  it('calls PATCH /boards/:id/columns/:columnId and invalidates the board detail cache', async () => {
    patchMock.mockResolvedValueOnce({ success: true, data: BOARD_RECORD });
    const queryClient = fakeQueryClient();
    const variables = { boardId: 'b1', columnId: 'c1', data: { label: 'Renomeada', color: '#FF0000' } };

    const result = await updateColumnMutation(queryClient).mutationFn?.(variables, fakeMutationContext);
    updateColumnMutation(queryClient).onSuccess?.(BOARD_RECORD, variables, undefined, { client: queryClient } as never);

    expect(patchMock).toHaveBeenCalledWith('/boards/b1/columns/c1', { label: 'Renomeada', color: '#FF0000' });
    expect(result).toEqual(BOARD_RECORD);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: boardKeys.detail('b1') });
  });

  it('throws with the backend message when the update fails', async () => {
    patchMock.mockResolvedValueOnce({ success: false, message: 'Board não encontrado' });

    await expect(
      updateColumnMutation(fakeQueryClient()).mutationFn?.(
        { boardId: 'b1', columnId: 'c1', data: {} },
        fakeMutationContext,
      ),
    ).rejects.toThrow('Board não encontrado');
  });
});

describe('reorderColumnsMutation (T14, spec.md KAN-09)', () => {
  it('calls PATCH /boards/:id/columns/reorder and invalidates the board detail cache', async () => {
    patchMock.mockResolvedValueOnce({ success: true, data: BOARD_RECORD });
    const queryClient = fakeQueryClient();
    const variables = { boardId: 'b1', columnIds: ['c2', 'c1'] };

    const result = await reorderColumnsMutation(queryClient).mutationFn?.(variables, fakeMutationContext);
    reorderColumnsMutation(queryClient).onSuccess?.(BOARD_RECORD, variables, undefined, {
      client: queryClient,
    } as never);

    expect(patchMock).toHaveBeenCalledWith('/boards/b1/columns/reorder', { columnIds: ['c2', 'c1'] });
    expect(result).toEqual(BOARD_RECORD);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: boardKeys.detail('b1') });
  });

  it('throws with the backend message when reordering fails', async () => {
    patchMock.mockResolvedValueOnce({ success: false, message: 'Board não encontrado' });

    await expect(
      reorderColumnsMutation(fakeQueryClient()).mutationFn?.({ boardId: 'b1', columnIds: [] }, fakeMutationContext),
    ).rejects.toThrow('Board não encontrado');
  });
});

describe('removeColumnMutation (T14, spec.md KAN-10/KAN-11/KAN-12)', () => {
  it('calls DELETE /boards/:id/columns/:columnId and invalidates the board detail cache', async () => {
    delMock.mockResolvedValueOnce({ success: true, data: BOARD_RECORD });
    const queryClient = fakeQueryClient();
    const variables = { boardId: 'b1', columnId: 'c1' };

    const result = await removeColumnMutation(queryClient).mutationFn?.(variables, fakeMutationContext);
    removeColumnMutation(queryClient).onSuccess?.(BOARD_RECORD, variables, undefined, { client: queryClient } as never);

    expect(delMock).toHaveBeenCalledWith('/boards/b1/columns/c1');
    expect(result).toEqual(BOARD_RECORD);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: boardKeys.detail('b1') });
  });

  it('throws with the backend message when removal is rejected (e.g. last column or non-empty column)', async () => {
    delMock.mockResolvedValueOnce({ success: false, message: 'A coluna precisa estar vazia para ser removida' });

    await expect(
      removeColumnMutation(fakeQueryClient()).mutationFn?.({ boardId: 'b1', columnId: 'c1' }, fakeMutationContext),
    ).rejects.toThrow('A coluna precisa estar vazia para ser removida');
  });
});

describe('createCardMutation (T14, spec.md KAN-13)', () => {
  it('calls POST /boards/:id/cards and invalidates the board cards list AND the hub lists (cardCount)', async () => {
    postMock.mockResolvedValueOnce({ success: true, data: CARD_RECORD });
    const queryClient = fakeQueryClient();
    const cardInput = {
      title: 'Ligar para o cliente',
      column: 'c1',
      customer: undefined,
      process: undefined,
      order: undefined,
      assignee: undefined,
    };
    const variables = { boardId: 'b1', data: cardInput };

    const result = await createCardMutation(queryClient).mutationFn?.(variables, fakeMutationContext);
    createCardMutation(queryClient).onSuccess?.(CARD_RECORD, variables, undefined, { client: queryClient } as never);

    expect(postMock).toHaveBeenCalledWith('/boards/b1/cards', cardInput);
    expect(result).toEqual(CARD_RECORD);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: boardKeys.cardsList('b1') });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: boardKeys.lists() });
  });

  it('throws with the backend message when creation fails (spec.md KAN-14/KAN-15)', async () => {
    postMock.mockResolvedValueOnce({ success: false, message: 'Coluna não existe neste board' });

    await expect(
      createCardMutation(fakeQueryClient()).mutationFn?.(
        {
          boardId: 'b1',
          data: {
            title: 'X',
            column: 'missing',
            customer: undefined,
            process: undefined,
            order: undefined,
            assignee: undefined,
          },
        },
        fakeMutationContext,
      ),
    ).rejects.toThrow('Coluna não existe neste board');
  });
});

describe('updateCardMutation (T14, spec.md KAN-16)', () => {
  it('calls PATCH /boards/:id/cards/:cardId and invalidates the board cards list', async () => {
    const updated = { ...CARD_RECORD, title: 'Editado' };
    patchMock.mockResolvedValueOnce({ success: true, data: updated });
    const queryClient = fakeQueryClient();
    const variables = { boardId: 'b1', cardId: 'card1', data: { title: 'Editado' } };

    const result = await updateCardMutation(queryClient).mutationFn?.(variables, fakeMutationContext);
    updateCardMutation(queryClient).onSuccess?.(updated, variables, undefined, { client: queryClient } as never);

    expect(patchMock).toHaveBeenCalledWith('/boards/b1/cards/card1', { title: 'Editado' });
    expect(result).toEqual(updated);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: boardKeys.cardsList('b1') });
  });

  it('throws with the backend message when the update fails', async () => {
    patchMock.mockResolvedValueOnce({ success: false, message: 'Card não encontrado' });

    await expect(
      updateCardMutation(fakeQueryClient()).mutationFn?.(
        { boardId: 'b1', cardId: 'missing', data: {} },
        fakeMutationContext,
      ),
    ).rejects.toThrow('Card não encontrado');
  });
});

describe('moveCardMutation (T14, spec.md KAN-18/KAN-19/KAN-20/KAN-21)', () => {
  it('calls PATCH /boards/:id/cards/:cardId/move and invalidates the board cards list', async () => {
    const moved = { ...CARD_RECORD, column: 'c2', position: 0 };
    patchMock.mockResolvedValueOnce({ success: true, data: moved });
    const queryClient = fakeQueryClient();
    const variables = { boardId: 'b1', cardId: 'card1', data: { column: 'c2', position: 0 } };

    const result = await moveCardMutation(queryClient).mutationFn?.(variables, fakeMutationContext);
    moveCardMutation(queryClient).onSuccess?.(moved, variables, undefined, { client: queryClient } as never);

    expect(patchMock).toHaveBeenCalledWith('/boards/b1/cards/card1/move', { column: 'c2', position: 0 });
    expect(result).toEqual(moved);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: boardKeys.cardsList('b1') });
  });

  it('rejects with the backend message when the target column does not exist in the board (spec.md KAN-21)', async () => {
    patchMock.mockResolvedValueOnce({ success: false, message: 'Coluna não existe neste board' });

    await expect(
      moveCardMutation(fakeQueryClient()).mutationFn?.(
        { boardId: 'b1', cardId: 'card1', data: { column: 'missing', position: 0 } },
        fakeMutationContext,
      ),
    ).rejects.toThrow('Coluna não existe neste board');
  });
});

describe('deleteCardMutation (T14, spec.md KAN-17)', () => {
  it('calls DELETE /boards/:id/cards/:cardId and invalidates the board cards list AND the hub lists (cardCount)', async () => {
    delMock.mockResolvedValueOnce({ success: true, message: 'Card removido com sucesso.' });
    const queryClient = fakeQueryClient();
    const variables = { boardId: 'b1', cardId: 'card1' };

    await deleteCardMutation(queryClient).mutationFn?.(variables, fakeMutationContext);
    deleteCardMutation(queryClient).onSuccess?.(undefined, variables, undefined, { client: queryClient } as never);

    expect(delMock).toHaveBeenCalledWith('/boards/b1/cards/card1');
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: boardKeys.cardsList('b1') });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: boardKeys.lists() });
  });

  it('throws with the backend message when deletion fails', async () => {
    delMock.mockResolvedValueOnce({ success: false, message: 'Card não encontrado' });

    await expect(
      deleteCardMutation(fakeQueryClient()).mutationFn?.({ boardId: 'b1', cardId: 'missing' }, fakeMutationContext),
    ).rejects.toThrow('Card não encontrado');
  });
});
