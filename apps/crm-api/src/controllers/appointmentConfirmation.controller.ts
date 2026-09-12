import { respObj } from '@crm/contracts';
import type { NextFunction, Request, Response } from 'express';
import { CustomError } from '../middlewares/errorHandler.middleware.js';
import * as appointmentConfirmationService from '../services/appointmentConfirmation.service.js';
import {
  AppointmentConfirmationExpiredError,
  AppointmentConfirmationNotFoundError,
  AppointmentConfirmationTerminalError,
} from '../services/appointmentConfirmation.service.js';

// Traduz os erros tipados do service (T22) pro código HTTP certo (spec.md
// SCH-23/SCH-25): not_found->404, expired->410, terminal->409 — mesmo
// idioma de order.controller.ts. `req.params.token` é a ÚNICA identificação
// aceita por este router (nunca `req.params.id`, SCH-27).
const handleServiceError = (e: unknown, next: NextFunction): void => {
  if (e instanceof AppointmentConfirmationNotFoundError) {
    next(new CustomError(e.message, 404));
    return;
  }
  if (e instanceof AppointmentConfirmationExpiredError) {
    next(new CustomError(e.message, 410));
    return;
  }
  if (e instanceof AppointmentConfirmationTerminalError) {
    next(new CustomError(e.message, 409));
    return;
  }
  next(e);
};

export const getByToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await appointmentConfirmationService.getByToken(req.params.token as string);
    res.json(respObj({ data: result }));
  } catch (e) {
    handleServiceError(e, next);
  }
};

export const confirmByToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await appointmentConfirmationService.confirmByToken(req.params.token as string);
    res.json(respObj({ data: result }));
  } catch (e) {
    handleServiceError(e, next);
  }
};

export const cancelByToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await appointmentConfirmationService.cancelByToken(req.params.token as string);
    res.json(respObj({ data: result }));
  } catch (e) {
    handleServiceError(e, next);
  }
};
