import type { CreateCard, MoveCard, UpdateCard } from '@crm/contracts';
import { respObj } from '@crm/contracts';
import type { NextFunction, Request, Response } from 'express';
import { CustomError } from '../middlewares/errorHandler.middleware.js';
import * as cardService from '../services/card.service.js';
import { CardNotFoundError, InvalidColumnError, InvalidReferenceError } from '../services/card.service.js';

// Traduz os erros tipados do service (T9) pro código HTTP certo (design.md
// Error Handling Strategy): not_found->404; coluna inválida (KAN-15/KAN-21)
// e referência cross-tenant/inexistente (KAN-14)->400, nunca 404 (não revela
// que o id existe em outro tenant, AD-010) — mesmo idioma de
// appointment.controller.ts (handleServiceError).
const handleServiceError = (e: unknown, next: NextFunction): void => {
  if (e instanceof CardNotFoundError) {
    next(new CustomError(e.message, 404, e.detail));
    return;
  }
  if (e instanceof InvalidColumnError || e instanceof InvalidReferenceError) {
    next(new CustomError(e.message, 400, e.detail));
    return;
  }
  next(e);
};

export const createCard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await cardService.createCard(
      req.tenantUser.tenant as string,
      req.params.id as string,
      req.body as CreateCard,
    );
    res.status(201).json(respObj({ data: result }));
  } catch (e) {
    handleServiceError(e, next);
  }
};

export const listCards = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await cardService.listCardsByBoard(req.tenantUser.tenant as string, req.params.id as string);
    res.json(respObj({ data: result }));
  } catch (e) {
    handleServiceError(e, next);
  }
};

export const updateCard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await cardService.updateCard(
      req.tenantUser.tenant as string,
      req.params.id as string,
      req.params.cardId as string,
      req.body as UpdateCard,
    );
    res.json(respObj({ data: result }));
  } catch (e) {
    handleServiceError(e, next);
  }
};

export const moveCard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await cardService.moveCard(
      req.tenantUser.tenant as string,
      req.params.id as string,
      req.params.cardId as string,
      req.body as MoveCard,
    );
    res.json(respObj({ data: result }));
  } catch (e) {
    handleServiceError(e, next);
  }
};

export const deleteCard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await cardService.deleteCard(req.tenantUser.tenant as string, req.params.id as string, req.params.cardId as string);
    res.json(respObj({ message: 'removed_successfully' }));
  } catch (e) {
    handleServiceError(e, next);
  }
};
