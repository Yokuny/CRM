import type { CreateCard, MoveCard, UpdateCard } from '@crm/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardRecord } from '../repositories/board.repository.js';
import type { CardRecord } from '../repositories/card.repository.js';

const findByIdMock = vi.fn();

vi.mock('../repositories/board.repository.js', () => ({
  findById: (...args: unknown[]) => findByIdMock(...args),
}));

const createCardMock = vi.fn();
const listByBoardMock = vi.fn();
const updateCardMock = vi.fn();
const moveCardMock = vi.fn();
const deleteCardMock = vi.fn();

vi.mock('../repositories/card.repository.js', () => ({
  createCard: (...args: unknown[]) => createCardMock(...args),
  listByBoard: (...args: unknown[]) => listByBoardMock(...args),
  updateCard: (...args: unknown[]) => updateCardMock(...args),
  moveCard: (...args: unknown[]) => moveCardMock(...args),
  deleteCard: (...args: unknown[]) => deleteCardMock(...args),
}));

const customerExistsMock = vi.fn();
const processExistsMock = vi.fn();
const orderExistsMock = vi.fn();
const userExistsMock = vi.fn();

vi.mock('@crm/db', () => ({
  Customer: { exists: (...args: unknown[]) => customerExistsMock(...args) },
  Process: { exists: (...args: unknown[]) => processExistsMock(...args) },
  Order: { exists: (...args: unknown[]) => orderExistsMock(...args) },
  User: { exists: (...args: unknown[]) => userExistsMock(...args) },
  tenantScoped: (filter: unknown) => filter,
}));

const TENANT_ID = 'tenant-1';
const BOARD_ID = 'board-1';

const sampleBoard = (overrides: Partial<BoardRecord> = {}): BoardRecord => ({
  id: BOARD_ID,
  name: 'Board',
  columns: [
    { id: 'col-1', label: 'A fazer', order: 0 },
    { id: 'col-2', label: 'Em andamento', order: 1 },
  ],
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

const sampleCard = (overrides: Partial<CardRecord> = {}): CardRecord => ({
  id: 'card-1',
  board: BOARD_ID,
  column: 'col-1',
  title: 'Ligar para o cliente',
  position: 0,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

describe('card.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findByIdMock.mockResolvedValue(sampleBoard());
    listByBoardMock.mockResolvedValue([]);
    customerExistsMock.mockResolvedValue({ _id: 'x' });
    processExistsMock.mockResolvedValue({ _id: 'x' });
    orderExistsMock.mockResolvedValue({ _id: 'x' });
    userExistsMock.mockResolvedValue({ _id: 'x' });
  });

  describe('createCard (KAN-13)', () => {
    it('creates a card with only title and column — position 0 in an empty column, no references sent to the repository', async () => {
      const { createCard } = await import('./card.service.js');
      const record = sampleCard();
      createCardMock.mockResolvedValueOnce(record);
      const input: CreateCard = {
        column: 'col-1',
        title: 'Ligar para o cliente',
        customer: undefined,
        process: undefined,
        order: undefined,
        assignee: undefined,
      };

      const result = await createCard(TENANT_ID, BOARD_ID, input);

      expect(createCardMock).toHaveBeenCalledWith({
        tenant: TENANT_ID,
        board: BOARD_ID,
        column: 'col-1',
        title: 'Ligar para o cliente',
        description: undefined,
        position: 0,
        customer: undefined,
        process: undefined,
        order: undefined,
        assignee: undefined,
      });
      expect(result).toBe(record);
    });

    it('places a new card after the existing cards already in that column', async () => {
      const { createCard } = await import('./card.service.js');
      listByBoardMock.mockResolvedValueOnce([
        sampleCard({ id: 'c1', column: 'col-1' }),
        sampleCard({ id: 'c2', column: 'col-1' }),
        sampleCard({ id: 'c3', column: 'col-2' }), // outra coluna, não conta
      ]);
      createCardMock.mockResolvedValueOnce(sampleCard());

      await createCard(TENANT_ID, BOARD_ID, {
        column: 'col-1',
        title: 'Novo',
        customer: undefined,
        process: undefined,
        order: undefined,
        assignee: undefined,
      });

      expect(createCardMock).toHaveBeenCalledWith(expect.objectContaining({ position: 2 }));
    });
  });

  describe('createCard — reference validation (KAN-14)', () => {
    it('rejects a customer that does not exist or belongs to another tenant', async () => {
      const { createCard, InvalidReferenceError } = await import('./card.service.js');
      customerExistsMock.mockResolvedValueOnce(null);
      const input: CreateCard = {
        column: 'col-1',
        title: 'X',
        customer: '507f1f77bcf86cd799439011',
        process: undefined,
        order: undefined,
        assignee: undefined,
      };

      await expect(createCard(TENANT_ID, BOARD_ID, input)).rejects.toBeInstanceOf(InvalidReferenceError);
      expect(createCardMock).not.toHaveBeenCalled();
    });

    it('rejects a process that does not exist or belongs to another tenant', async () => {
      const { createCard, InvalidReferenceError } = await import('./card.service.js');
      processExistsMock.mockResolvedValueOnce(null);
      const input: CreateCard = {
        column: 'col-1',
        title: 'X',
        customer: undefined,
        process: '507f1f77bcf86cd799439011',
        order: undefined,
        assignee: undefined,
      };

      await expect(createCard(TENANT_ID, BOARD_ID, input)).rejects.toBeInstanceOf(InvalidReferenceError);
      expect(createCardMock).not.toHaveBeenCalled();
    });

    it('rejects an order that does not exist or belongs to another tenant', async () => {
      const { createCard, InvalidReferenceError } = await import('./card.service.js');
      orderExistsMock.mockResolvedValueOnce(null);
      const input: CreateCard = {
        column: 'col-1',
        title: 'X',
        customer: undefined,
        process: undefined,
        order: '507f1f77bcf86cd799439011',
        assignee: undefined,
      };

      await expect(createCard(TENANT_ID, BOARD_ID, input)).rejects.toBeInstanceOf(InvalidReferenceError);
      expect(createCardMock).not.toHaveBeenCalled();
    });

    it('rejects an assignee that does not exist or belongs to another tenant', async () => {
      const { createCard, InvalidReferenceError } = await import('./card.service.js');
      userExistsMock.mockResolvedValueOnce(null);
      const input: CreateCard = {
        column: 'col-1',
        title: 'X',
        customer: undefined,
        process: undefined,
        order: undefined,
        assignee: '507f1f77bcf86cd799439011',
      };

      await expect(createCard(TENANT_ID, BOARD_ID, input)).rejects.toBeInstanceOf(InvalidReferenceError);
      expect(createCardMock).not.toHaveBeenCalled();
    });
  });

  describe('createCard — column validation (KAN-15)', () => {
    it('rejects a column that does not exist in board.columns, without checking references first', async () => {
      const { createCard, InvalidColumnError } = await import('./card.service.js');
      const input: CreateCard = {
        column: 'col-does-not-exist',
        title: 'X',
        customer: '507f1f77bcf86cd799439011',
        process: undefined,
        order: undefined,
        assignee: undefined,
      };

      await expect(createCard(TENANT_ID, BOARD_ID, input)).rejects.toBeInstanceOf(InvalidColumnError);
      expect(customerExistsMock).not.toHaveBeenCalled();
      expect(createCardMock).not.toHaveBeenCalled();
    });

    it('rejects when the board itself does not exist for this tenant', async () => {
      const { createCard, InvalidColumnError } = await import('./card.service.js');
      findByIdMock.mockResolvedValueOnce(null);
      const input: CreateCard = {
        column: 'col-1',
        title: 'X',
        customer: undefined,
        process: undefined,
        order: undefined,
        assignee: undefined,
      };

      await expect(createCard(TENANT_ID, BOARD_ID, input)).rejects.toBeInstanceOf(InvalidColumnError);
      expect(createCardMock).not.toHaveBeenCalled();
    });
  });

  describe('listCardsByBoard (KAN-17)', () => {
    it('delegates to the repository and returns its result', async () => {
      const { listCardsByBoard } = await import('./card.service.js');
      const records = [sampleCard()];
      listByBoardMock.mockResolvedValueOnce(records);

      const result = await listCardsByBoard(TENANT_ID, BOARD_ID);

      expect(listByBoardMock).toHaveBeenCalledWith(TENANT_ID, BOARD_ID);
      expect(result).toBe(records);
    });
  });

  describe('updateCard (KAN-16)', () => {
    it('never sends column/position to the repository and persists title/description/references', async () => {
      const { updateCard } = await import('./card.service.js');
      const record = sampleCard({ title: 'Editado' });
      updateCardMock.mockResolvedValueOnce(record);
      const input: UpdateCard = { title: 'Editado', customer: '507f1f77bcf86cd799439011' };

      const result = await updateCard(TENANT_ID, BOARD_ID, 'card-1', input);

      expect(updateCardMock).toHaveBeenCalledWith(TENANT_ID, BOARD_ID, 'card-1', {
        title: 'Editado',
        description: undefined,
        customer: '507f1f77bcf86cd799439011',
        process: undefined,
        order: undefined,
        assignee: undefined,
      });
      expect(updateCardMock.mock.calls[0]?.[3]).not.toHaveProperty('column');
      expect(updateCardMock.mock.calls[0]?.[3]).not.toHaveProperty('position');
      expect(result).toBe(record);
    });

    it('rejects an invalid reference and never calls the repository (KAN-14 also applies to edit)', async () => {
      const { updateCard, InvalidReferenceError } = await import('./card.service.js');
      customerExistsMock.mockResolvedValueOnce(null);

      await expect(
        updateCard(TENANT_ID, BOARD_ID, 'card-1', { customer: '507f1f77bcf86cd799439011' }),
      ).rejects.toBeInstanceOf(InvalidReferenceError);
      expect(updateCardMock).not.toHaveBeenCalled();
    });

    it('throws CardNotFoundError when the repository finds no card for this tenant/board/id (AD-010)', async () => {
      const { updateCard, CardNotFoundError } = await import('./card.service.js');
      updateCardMock.mockResolvedValueOnce(null);

      await expect(updateCard(TENANT_ID, BOARD_ID, 'missing-id', { title: 'X' })).rejects.toBeInstanceOf(
        CardNotFoundError,
      );
    });
  });

  describe('moveCard (KAN-18, KAN-19)', () => {
    it('persists the new column and position when the column exists in the board', async () => {
      const { moveCard } = await import('./card.service.js');
      const record = sampleCard({ column: 'col-2', position: 3 });
      moveCardMock.mockResolvedValueOnce(record);
      const input: MoveCard = { column: 'col-2', position: 3 };

      const result = await moveCard(TENANT_ID, BOARD_ID, 'card-1', input);

      expect(moveCardMock).toHaveBeenCalledWith(TENANT_ID, BOARD_ID, 'card-1', 'col-2', 3);
      expect(result).toBe(record);
    });

    it('throws CardNotFoundError when the repository finds no card for this tenant/board/id (AD-010)', async () => {
      const { moveCard, CardNotFoundError } = await import('./card.service.js');
      moveCardMock.mockResolvedValueOnce(null);

      await expect(
        moveCard(TENANT_ID, BOARD_ID, 'missing-id', { column: 'col-1', position: 0 }),
      ).rejects.toBeInstanceOf(CardNotFoundError);
    });
  });

  describe('moveCard — column validation (KAN-21)', () => {
    it('rejects a payload referencing a column that does not exist in that board, even if it "looks" valid', async () => {
      const { moveCard, InvalidColumnError } = await import('./card.service.js');
      const input: MoveCard = { column: 'col-does-not-exist', position: 0 };

      await expect(moveCard(TENANT_ID, BOARD_ID, 'card-1', input)).rejects.toBeInstanceOf(InvalidColumnError);
      expect(moveCardMock).not.toHaveBeenCalled();
    });
  });

  describe('deleteCard', () => {
    it('resolves when the repository confirms deletion', async () => {
      const { deleteCard } = await import('./card.service.js');
      deleteCardMock.mockResolvedValueOnce({ deletedCount: 1 });

      await expect(deleteCard(TENANT_ID, BOARD_ID, 'card-1')).resolves.toBeUndefined();
    });

    it('throws CardNotFoundError when the repository deletes nothing (AD-010)', async () => {
      const { deleteCard, CardNotFoundError } = await import('./card.service.js');
      deleteCardMock.mockResolvedValueOnce({ deletedCount: 0 });

      await expect(deleteCard(TENANT_ID, BOARD_ID, 'missing-id')).rejects.toBeInstanceOf(CardNotFoundError);
    });
  });
});
