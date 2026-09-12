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

// SCH-32: cancelamento pelo operador, motivo opcional já validado por
// cancelAppointmentSchema (router). `userId` vem sempre de
// req.tenantUser.user, nunca do corpo (AD-010).
export const cancelAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await appointmentService.cancelAppointment(
      req.tenantUser.tenant as string,
      req.params.id as string,
      req.tenantUser.user as string,
      (req.body as { reason?: string }).reason,
    );
    res.json(respObj({ data: result }));
  } catch (e) {
    handleServiceError(e, next);
  }
};

// SCH-31: remarcação — mesmo Appointment, novo horário (hora de parede).
export const rescheduleAppointment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await appointmentService.rescheduleAppointment(
      req.tenantUser.tenant as string,
      req.params.id as string,
      req.body,
    );
    res.json(respObj({ data: result }));
  } catch (e) {
    handleServiceError(e, next);
  }
};

// SCH-34: comparecimento — `status` já validado por markAttendanceSchema
// (router, só completed|no_show).
export const markAttendance = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await appointmentService.markAttendance(
      req.tenantUser.tenant as string,
      req.params.id as string,
      req.tenantUser.user as string,
      (req.body as { status: 'completed' | 'no_show' }).status,
    );
    res.json(respObj({ data: result }));
  } catch (e) {
    handleServiceError(e, next);
  }
};

// SCH-37: "Pedir confirmação" — devolve o link wa.me com um token apt_… novo.
export const requestConfirmationLink = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await appointmentService.requestConfirmationLink(
      req.tenantUser.tenant as string,
      req.params.id as string,
    );
    res.json(respObj({ data: result }));
  } catch (e) {
    handleServiceError(e, next);
  }
};
