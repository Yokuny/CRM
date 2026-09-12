import { respObj } from '@crm/contracts';
import type { NextFunction, Request, Response } from 'express';
import { CustomError } from '../middlewares/errorHandler.middleware.js';
import type { ListSpacesQuery } from '../services/space.service.js';
import * as spaceService from '../services/space.service.js';
import { SpaceNotFoundError } from '../services/space.service.js';

// O Tenant vem sempre de req.tenantUser (AD-010), nunca do corpo/query —
// mesma convenção de professional.controller.ts. Traduz o erro tipado do
// service (T17) pro código HTTP certo: SpaceNotFoundError->404.
export const createSpace = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await spaceService.createSpace(req.tenantUser.tenant as string, req.body);
    res.status(201).json(respObj({ data: result }));
  } catch (e) {
    next(e);
  }
};

export const getSpaceById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await spaceService.getSpaceById(req.tenantUser.tenant as string, req.params.id as string);
    res.json(respObj({ data: result }));
  } catch (e) {
    if (e instanceof SpaceNotFoundError) {
      next(new CustomError(e.message, 404));
      return;
    }
    next(e);
  }
};

export const listSpaces = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await spaceService.listSpaces(
      req.tenantUser.tenant as string,
      req.query as unknown as ListSpacesQuery,
    );
    res.json(respObj({ data: result }));
  } catch (e) {
    next(e);
  }
};

export const updateSpace = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await spaceService.updateSpace(req.tenantUser.tenant as string, req.params.id as string, req.body);
    res.json(respObj({ data: result }));
  } catch (e) {
    if (e instanceof SpaceNotFoundError) {
      next(new CustomError(e.message, 404));
      return;
    }
    next(e);
  }
};
