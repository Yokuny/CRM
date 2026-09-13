import type { CreateBoard, UpdateBoard } from '@crm/contracts';
import { respObj } from '@crm/contracts';
import type { NextFunction, Request, Response } from 'express';
import { CustomError } from '../middlewares/errorHandler.middleware.js';
import type { AddColumnData, UpdateColumnData } from '../services/board.service.js';
import * as boardService from '../services/board.service.js';
import {
  BoardNotFoundError,
  ColumnNotEmptyError,
  EmptyColumnsError,
  LastColumnError,
} from '../services/board.service.js';

// Traduz os erros tipados do service (T8) pro código HTTP certo (design.md
// Error Handling Strategy): not_found->404, invariantes de coluna (KAN-02/
// KAN-10/KAN-11)->400 — mesmo idioma de appointment.controller.ts
// (handleServiceError). O Tenant vem sempre de req.tenantUser (AD-010),
// nunca do corpo/query.
const handleServiceError = (e: unknown, next: NextFunction): void => {
  if (e instanceof BoardNotFoundError) {
    next(new CustomError(e.message, 404));
    return;
  }
  if (e instanceof EmptyColumnsError || e instanceof LastColumnError || e instanceof ColumnNotEmptyError) {
    next(new CustomError(e.message, 400));
    return;
  }
  next(e);
};

export const createBoard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await boardService.createBoard(req.tenantUser.tenant as string, req.body as CreateBoard);
    res.status(201).json(respObj({ data: result }));
  } catch (e) {
    handleServiceError(e, next);
  }
};

export const listBoards = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await boardService.listBoards(req.tenantUser.tenant as string);
    res.json(respObj({ data: result }));
  } catch (e) {
    handleServiceError(e, next);
  }
};

export const getBoardById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await boardService.getBoardById(req.tenantUser.tenant as string, req.params.id as string);
    res.json(respObj({ data: result }));
  } catch (e) {
    handleServiceError(e, next);
  }
};

export const updateBoard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await boardService.updateBoard(
      req.tenantUser.tenant as string,
      req.params.id as string,
      req.body as UpdateBoard,
    );
    res.json(respObj({ data: result }));
  } catch (e) {
    handleServiceError(e, next);
  }
};

// KAN-23: só chega aqui depois do middleware isAdmin (router, T12) — nenhuma
// checagem extra de role neste controller.
export const deleteBoard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await boardService.deleteBoard(req.tenantUser.tenant as string, req.params.id as string);
    res.json(respObj({ message: 'Board removido com sucesso.' }));
  } catch (e) {
    handleServiceError(e, next);
  }
};

export const addColumn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await boardService.addColumn(
      req.tenantUser.tenant as string,
      req.params.id as string,
      req.body as AddColumnData,
    );
    res.status(201).json(respObj({ data: result }));
  } catch (e) {
    handleServiceError(e, next);
  }
};

export const updateColumn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await boardService.updateColumn(
      req.tenantUser.tenant as string,
      req.params.id as string,
      req.params.columnId as string,
      req.body as UpdateColumnData,
    );
    res.json(respObj({ data: result }));
  } catch (e) {
    handleServiceError(e, next);
  }
};

export const reorderColumns = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { columnIds } = req.body as { columnIds: string[] };
    const result = await boardService.reorderColumns(
      req.tenantUser.tenant as string,
      req.params.id as string,
      columnIds,
    );
    res.json(respObj({ data: result }));
  } catch (e) {
    handleServiceError(e, next);
  }
};

export const removeColumn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await boardService.removeColumn(
      req.tenantUser.tenant as string,
      req.params.id as string,
      req.params.columnId as string,
    );
    res.json(respObj({ data: result }));
  } catch (e) {
    handleServiceError(e, next);
  }
};
