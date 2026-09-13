import type { CreateBoard, UpdateBoard } from '@crm/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardRecord } from '../repositories/board.repository.js';

const createBoardMock = vi.fn();
const findByIdMock = vi.fn();
const listBoardsMock = vi.fn();
const updateBoardMock = vi.fn();
const deleteBoardMock = vi.fn();
const addColumnMock = vi.fn();
const updateColumnMock = vi.fn();
const reorderColumnsMock = vi.fn();
const removeColumnMock = vi.fn();

vi.mock('../repositories/board.repository.js', () => ({
  createBoard: (...args: unknown[]) => createBoardMock(...args),
  findById: (...args: unknown[]) => findByIdMock(...args),
  listBoards: (...args: unknown[]) => listBoardsMock(...args),
  updateBoard: (...args: unknown[]) => updateBoardMock(...args),
  deleteBoard: (...args: unknown[]) => deleteBoardMock(...args),
  addColumn: (...args: unknown[]) => addColumnMock(...args),
  updateColumn: (...args: unknown[]) => updateColumnMock(...args),
  reorderColumns: (...args: unknown[]) => reorderColumnsMock(...args),
  removeColumn: (...args: unknown[]) => removeColumnMock(...args),
}));

const existsInColumnMock = vi.fn();
const deleteAllByBoardMock = vi.fn();

vi.mock('../repositories/card.repository.js', () => ({
  existsInColumn: (...args: unknown[]) => existsInColumnMock(...args),
  deleteAllByBoard: (...args: unknown[]) => deleteAllByBoardMock(...args),
}));

const TENANT_ID = 'tenant-1';

const sampleBoard = (overrides: Partial<BoardRecord> = {}): BoardRecord => ({
  id: 'board-1',
  name: 'Cobranças em atraso',
  columns: [
    { id: 'col-1', label: 'A fazer', order: 0 },
    { id: 'col-2', label: 'Em andamento', order: 1 },
  ],
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

describe('board.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createBoard (KAN-01, KAN-02)', () => {
    it('delegates to the repository and returns its result when at least 1 column is given (KAN-01)', async () => {
      const { createBoard } = await import('./board.service.js');
      const record = sampleBoard();
      createBoardMock.mockResolvedValueOnce(record);
      const input: CreateBoard = { name: 'Cobranças em atraso', columns: [{ label: 'A fazer' }] };

      const result = await createBoard(TENANT_ID, input);

      expect(createBoardMock).toHaveBeenCalledWith({
        tenant: TENANT_ID,
        name: 'Cobranças em atraso',
        description: undefined,
        columns: [{ label: 'A fazer' }],
      });
      expect(result).toBe(record);
    });

    it('throws EmptyColumnsError and never calls the repository when columns is empty (KAN-02)', async () => {
      const { createBoard, EmptyColumnsError } = await import('./board.service.js');
      const input = { name: 'Sem colunas', columns: [] } as unknown as CreateBoard;

      await expect(createBoard(TENANT_ID, input)).rejects.toBeInstanceOf(EmptyColumnsError);
      expect(createBoardMock).not.toHaveBeenCalled();
    });
  });

  describe('getBoardById (KAN-06)', () => {
    it('throws BoardNotFoundError when the repository finds no board for this tenant/id', async () => {
      const { getBoardById, BoardNotFoundError } = await import('./board.service.js');
      findByIdMock.mockResolvedValueOnce(null);

      await expect(getBoardById(TENANT_ID, 'missing-id')).rejects.toBeInstanceOf(BoardNotFoundError);
    });

    it('returns the repository result when found', async () => {
      const { getBoardById } = await import('./board.service.js');
      const record = sampleBoard();
      findByIdMock.mockResolvedValueOnce(record);

      const result = await getBoardById(TENANT_ID, 'board-1');

      expect(result).toBe(record);
    });
  });

  describe('updateBoard (KAN-04, KAN-06)', () => {
    it('delegates to the repository and returns the updated record (KAN-04)', async () => {
      const { updateBoard } = await import('./board.service.js');
      const record = sampleBoard({ description: 'Nova descrição' });
      updateBoardMock.mockResolvedValueOnce(record);
      const input: UpdateBoard = { description: 'Nova descrição' };

      const result = await updateBoard(TENANT_ID, 'board-1', input);

      expect(updateBoardMock).toHaveBeenCalledWith(TENANT_ID, 'board-1', input);
      expect(result).toBe(record);
    });

    it("throws BoardNotFoundError for a DIFFERENT tenant's board id (KAN-06)", async () => {
      const { updateBoard, BoardNotFoundError } = await import('./board.service.js');
      updateBoardMock.mockResolvedValueOnce(null);

      await expect(updateBoard(TENANT_ID, 'missing-id', { name: 'X' })).rejects.toBeInstanceOf(BoardNotFoundError);
    });
  });

  describe('deleteBoard (KAN-22)', () => {
    it('calls card.repository.deleteAllByBoard only AFTER board.repository.deleteBoard confirms deletion', async () => {
      const { deleteBoard } = await import('./board.service.js');
      const callOrder: string[] = [];
      deleteBoardMock.mockImplementationOnce(async () => {
        callOrder.push('deleteBoard');
        return { deletedCount: 1 };
      });
      deleteAllByBoardMock.mockImplementationOnce(async () => {
        callOrder.push('deleteAllByBoard');
        return { deletedCount: 2 };
      });

      await deleteBoard(TENANT_ID, 'board-1');

      expect(callOrder).toEqual(['deleteBoard', 'deleteAllByBoard']);
      expect(deleteAllByBoardMock).toHaveBeenCalledWith(TENANT_ID, 'board-1');
    });

    it('throws BoardNotFoundError and never calls deleteAllByBoard when the board did not exist for this tenant', async () => {
      const { deleteBoard, BoardNotFoundError } = await import('./board.service.js');
      deleteBoardMock.mockResolvedValueOnce({ deletedCount: 0 });

      await expect(deleteBoard(TENANT_ID, 'missing-id')).rejects.toBeInstanceOf(BoardNotFoundError);
      expect(deleteAllByBoardMock).not.toHaveBeenCalled();
    });
  });

  describe('addColumn (KAN-07)', () => {
    it('delegates to the repository and returns the updated board', async () => {
      const { addColumn } = await import('./board.service.js');
      const record = sampleBoard();
      addColumnMock.mockResolvedValueOnce(record);

      const result = await addColumn(TENANT_ID, 'board-1', { label: 'Concluído' });

      expect(addColumnMock).toHaveBeenCalledWith(TENANT_ID, 'board-1', { label: 'Concluído' });
      expect(result).toBe(record);
    });

    it("throws BoardNotFoundError for a DIFFERENT tenant's board id", async () => {
      const { addColumn, BoardNotFoundError } = await import('./board.service.js');
      addColumnMock.mockResolvedValueOnce(null);

      await expect(addColumn(TENANT_ID, 'missing-id', { label: 'X' })).rejects.toBeInstanceOf(BoardNotFoundError);
    });
  });

  describe('updateColumn (KAN-08)', () => {
    it('delegates to the repository and returns the updated board', async () => {
      const { updateColumn } = await import('./board.service.js');
      const record = sampleBoard();
      updateColumnMock.mockResolvedValueOnce(record);

      const result = await updateColumn(TENANT_ID, 'board-1', 'col-1', { label: 'Fazendo' });

      expect(updateColumnMock).toHaveBeenCalledWith(TENANT_ID, 'board-1', 'col-1', { label: 'Fazendo' });
      expect(result).toBe(record);
    });

    it('throws BoardNotFoundError when the repository finds no board/column match', async () => {
      const { updateColumn, BoardNotFoundError } = await import('./board.service.js');
      updateColumnMock.mockResolvedValueOnce(null);

      await expect(updateColumn(TENANT_ID, 'missing-id', 'col-1', { label: 'X' })).rejects.toBeInstanceOf(
        BoardNotFoundError,
      );
    });
  });

  describe('reorderColumns (KAN-09)', () => {
    it('delegates to the repository and returns the updated board', async () => {
      const { reorderColumns } = await import('./board.service.js');
      const record = sampleBoard();
      reorderColumnsMock.mockResolvedValueOnce(record);

      const result = await reorderColumns(TENANT_ID, 'board-1', ['col-2', 'col-1']);

      expect(reorderColumnsMock).toHaveBeenCalledWith(TENANT_ID, 'board-1', ['col-2', 'col-1']);
      expect(result).toBe(record);
    });

    it("throws BoardNotFoundError for a DIFFERENT tenant's board id", async () => {
      const { reorderColumns, BoardNotFoundError } = await import('./board.service.js');
      reorderColumnsMock.mockResolvedValueOnce(null);

      await expect(reorderColumns(TENANT_ID, 'missing-id', ['col-1'])).rejects.toBeInstanceOf(BoardNotFoundError);
    });
  });

  describe('removeColumn (KAN-10, KAN-11, KAN-12)', () => {
    it('throws LastColumnError when the board has only 1 column, without querying existsInColumn (KAN-11)', async () => {
      const { removeColumn, LastColumnError } = await import('./board.service.js');
      findByIdMock.mockResolvedValueOnce(sampleBoard({ columns: [{ id: 'col-1', label: 'Única', order: 0 }] }));

      await expect(removeColumn(TENANT_ID, 'board-1', 'col-1')).rejects.toBeInstanceOf(LastColumnError);
      expect(existsInColumnMock).not.toHaveBeenCalled();
      expect(removeColumnMock).not.toHaveBeenCalled();
    });

    it('throws ColumnNotEmptyError when the column still has at least 1 card (KAN-10)', async () => {
      const { removeColumn, ColumnNotEmptyError } = await import('./board.service.js');
      findByIdMock.mockResolvedValueOnce(sampleBoard());
      existsInColumnMock.mockResolvedValueOnce(true);

      await expect(removeColumn(TENANT_ID, 'board-1', 'col-2')).rejects.toBeInstanceOf(ColumnNotEmptyError);
      expect(removeColumnMock).not.toHaveBeenCalled();
    });

    it('removes an empty column when the board has more than 1 column (KAN-12)', async () => {
      const { removeColumn } = await import('./board.service.js');
      findByIdMock.mockResolvedValueOnce(sampleBoard());
      existsInColumnMock.mockResolvedValueOnce(false);
      const afterRemoval = sampleBoard({ columns: [{ id: 'col-1', label: 'A fazer', order: 0 }] });
      removeColumnMock.mockResolvedValueOnce(afterRemoval);

      const result = await removeColumn(TENANT_ID, 'board-1', 'col-2');

      expect(removeColumnMock).toHaveBeenCalledWith(TENANT_ID, 'board-1', 'col-2');
      expect(result).toBe(afterRemoval);
    });

    it("throws BoardNotFoundError for a DIFFERENT tenant's board id", async () => {
      const { removeColumn, BoardNotFoundError } = await import('./board.service.js');
      findByIdMock.mockResolvedValueOnce(null);

      await expect(removeColumn(TENANT_ID, 'missing-id', 'col-1')).rejects.toBeInstanceOf(BoardNotFoundError);
    });
  });
});
