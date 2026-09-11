import { respObj } from '@crm/contracts';
import type { NextFunction, Request, Response } from 'express';
import { CustomError } from '../middlewares/errorHandler.middleware.js';
import * as appointmentService from '../services/appointment.service.js';
import {
  AppointmentConflictError,
  AppointmentNotFoundError,
  AppointmentTerminalError,
} from '../services/appointment.service.js';

// Traduz os erros tipados do service (T23) pro código HTTP certo (design.md
// Error Handling Strategy): not_found/invalid->404, conflict->409,
// terminal->409 — mesmo idioma de order.controller.ts. O Tenant vem sempre de
// req.tenantUser (AD-010), nunca do corpo/query.
const handleServiceError = (e: unknown, next: NextFunction): void => {
  if (e instanceof AppointmentNotFoundError) {
    next(new CustomError(e.message, 404));
    return;
  }
  if (e instanceof AppointmentConflictError) {
    next(new CustomError(e.message, 409));
    return;
  }
  if (e instanceof AppointmentTerminalError) {
    next(new CustomError(e.message, 409));
    return;
  }
  next(e);
};

export type ListAppointmentsQuery = {
  from: string;
  to: string;
  professional?: string;
  space?: string;
};

// SCH-29: `from`/`to`/`professional`/`space` já validados (formato + faixa
// de 42 dias) por validListAppointmentsQuery (router).
export const listAppointments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const query = req.query as unknown as ListAppointmentsQuery;
    const result = await appointmentService.listAppointments(req.tenantUser.tenant as string, {
      from: query.from,
      to: query.to,
      professionalId: query.professional,
      spaceId: query.space,
    });
    res.json(respObj({ data: result }));
  } catch (e) {
    handleServiceError(e, next);
  }
};

export type UpcomingAppointmentQuery = { customer: string };

// SCH-38: `null` (nenhum agendamento futuro ativo) é uma resposta 200 válida
// — nunca 404.
export const getUpcoming = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const query = req.query as unknown as UpcomingAppointmentQuery;
    const result = await appointmentService.getUpcomingByCustomer(req.tenantUser.tenant as string, query.customer);
    res.json(respObj({ data: result }));
  } catch (e) {
    handleServiceError(e, next);
  }
};

// SCH-30: encaixe do operador — 201 mesmo fora da grade; 409 na sobreposição.
export const createAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await appointmentService.createManualAppointment(req.tenantUser.tenant as string, req.body);
    res.status(201).json(respObj({ data: result }));
  } catch (e) {
    handleServiceError(e, next);
  }
};

// SCH-33: bloqueio de horário.
export const createBlock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await appointmentService.createBlock(req.tenantUser.tenant as string, req.body);
    res.status(201).json(respObj({ data: result }));
  } catch (e) {
    handleServiceError(e, next);
  }
};

export const deleteBlock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await appointmentService.deleteBlock(req.tenantUser.tenant as string, req.params.id as string);
    res.json(respObj({ data: result }));
  } catch (e) {
    handleServiceError(e, next);
  }
};
