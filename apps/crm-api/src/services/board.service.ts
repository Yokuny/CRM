import type { CreateBoard, UpdateBoard } from '@crm/contracts';
import { KeyedError } from '../middlewares/errorHandler.middleware.js';
import type { BoardRecord, BoardWithCardCount } from '../repositories/board.repository.js';
import * as boardRepository from '../repositories/board.repository.js';
import * as cardRepository from '../repositories/card.repository.js';

// AD-010: findById/updateBoard (board.repository, T6) já são tenant-scoped —
// um id de outro tenant simplesmente não existe para esta sessão (KAN-06),
// mesmo idioma 404 de professional.service.ts's ProfessionalNotFoundError.
export class BoardNotFoundError extends KeyedError {}

// KAN-02: mesmo invariante já garantido no contrato (createBoardSchema,
// T3) — reforçado aqui como defesa em profundidade, já que design.md marca
// "columns.length>=1" como invariante do SERVICE, não só do contrato HTTP.
export class EmptyColumnsError extends KeyedError {}

// KAN-11: uma coluna que é a única restante do board nunca pode ser
// removida, mesmo vazia (garante que todo board tenha sempre >=1 coluna).
export class LastColumnError extends KeyedError {}

// KAN-10: uma coluna com ao menos 1 card não pode ser removida — o operador
// precisa mover os cards antes.
export class ColumnNotEmptyError extends KeyedError {}

export const createBoard = async (tenantId: string, data: CreateBoard): Promise<BoardRecord> => {
  if (data.columns.length === 0) throw new EmptyColumnsError('at_least_one_column');
  return boardRepository.createBoard({
    tenant: tenantId,
    name: data.name,
    description: data.description,
    columns: data.columns,
  });
};

export const listBoards = async (tenantId: string): Promise<BoardWithCardCount[]> =>
  boardRepository.listBoards(tenantId);

export const getBoardById = async (tenantId: string, id: string): Promise<BoardRecord> => {
  const board = await boardRepository.findById(tenantId, id);
  if (!board) throw new BoardNotFoundError('not_found');
  return board;
};

export const updateBoard = async (tenantId: string, id: string, data: UpdateBoard): Promise<BoardRecord> => {
  const updated = await boardRepository.updateBoard(tenantId, id, data);
  if (!updated) throw new BoardNotFoundError('not_found');
  return updated;
};

// KAN-22: cascata — só apaga os cards DEPOIS de confirmar que o board foi
// apagado (evita apagar cards de um board que nunca existiu para este
// tenant). Sem transação nativa (Mongo standalone, mesmo trade-off já
// aceito em AD-024/AD-033/AD-034 — ver design.md Error Handling Strategy).
export const deleteBoard = async (tenantId: string, id: string): Promise<void> => {
  const result = await boardRepository.deleteBoard(tenantId, id);
  if (result.deletedCount === 0) throw new BoardNotFoundError('not_found');
  await cardRepository.deleteAllByBoard(tenantId, id);
};

export type AddColumnData = { label: string; color?: string };

export const addColumn = async (tenantId: string, boardId: string, data: AddColumnData): Promise<BoardRecord> => {
  const updated = await boardRepository.addColumn(tenantId, boardId, data);
  if (!updated) throw new BoardNotFoundError('not_found');
  return updated;
};

export type UpdateColumnData = { label?: string; color?: string };

export const updateColumn = async (
  tenantId: string,
  boardId: string,
  columnId: string,
  data: UpdateColumnData,
): Promise<BoardRecord> => {
  const updated = await boardRepository.updateColumn(tenantId, boardId, columnId, data);
  if (!updated) throw new BoardNotFoundError('not_found');
  return updated;
};

export const reorderColumns = async (tenantId: string, boardId: string, columnIds: string[]): Promise<BoardRecord> => {
  const updated = await boardRepository.reorderColumns(tenantId, boardId, columnIds);
  if (!updated) throw new BoardNotFoundError('not_found');
  return updated;
};

// KAN-10/KAN-11: a última coluna nunca pode ser removida (mesmo vazia) — não
// depende de qual columnId foi pedido, só do total de colunas do board, por
// isso é checado ANTES da consulta (mais barata) de existsInColumn.
export const removeColumn = async (tenantId: string, boardId: string, columnId: string): Promise<BoardRecord> => {
  const board = await boardRepository.findById(tenantId, boardId);
  if (!board) throw new BoardNotFoundError('not_found');
  if (board.columns.length === 1) throw new LastColumnError('at_least_one_column');

  const hasCards = await cardRepository.existsInColumn(tenantId, boardId, columnId);
  if (hasCards) throw new ColumnNotEmptyError('column_not_empty');

  const updated = await boardRepository.removeColumn(tenantId, boardId, columnId);
  if (!updated) throw new BoardNotFoundError('not_found');
  return updated;
};
