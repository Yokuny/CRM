import { respObj } from '@crm/contracts';
import type { NextFunction, Request, Response } from 'express';
import { CustomError } from '../middlewares/errorHandler.middleware.js';
import type { ListProfessionalsQuery } from '../services/professional.service.js';
import * as professionalService from '../services/professional.service.js';
import { ProfessionalNotFoundError } from '../services/professional.service.js';

// O Tenant vem sempre de req.tenantUser (AD-010), nunca do corpo/query —
// mesma convenção de product.controller.ts. Traduz o erro tipado do service
// (T14) pro código HTTP certo: ProfessionalNotFoundError->404.
export const createProfessional = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await professionalService.createProfessional(req.tenantUser.tenant as string, req.body);
    res.status(201).json(respObj({ data: result }));
  } catch (e) {
    next(e);
  }
};

export const getProfessionalById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await professionalService.getProfessionalById(
      req.tenantUser.tenant as string,
      req.params.id as string,
    );
    res.json(respObj({ data: result }));
  } catch (e) {
    if (e instanceof ProfessionalNotFoundError) {
      next(new CustomError(e.message, 404));
      return;
    }
    next(e);
  }
};

export const listProfessionals = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await professionalService.listProfessionals(
      req.tenantUser.tenant as string,
      req.query as unknown as ListProfessionalsQuery,
    );
    res.json(respObj({ data: result }));
  } catch (e) {
    next(e);
  }
};

export const updateProfessional = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await professionalService.updateProfessional(
      req.tenantUser.tenant as string,
      req.params.id as string,
      req.body,
    );
    res.json(respObj({ data: result }));
  } catch (e) {
    if (e instanceof ProfessionalNotFoundError) {
      next(new CustomError(e.message, 404));
      return;
    }
    next(e);
  }
};
