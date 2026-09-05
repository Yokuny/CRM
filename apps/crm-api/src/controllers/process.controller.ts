import { respObj } from '@crm/contracts';
import type { NextFunction, Request, Response } from 'express';
import * as processService from '../services/process.service.js';

// O Tenant vem sempre de req.tenantUser (resolvido do banco pela sessão),
// nunca do corpo/params/query (AD-010/CORE-06) — mesma convenção de
// customer.controller.ts.
export const createProcess = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await processService.createProcess(req.tenantUser.tenant as string, req.body);
    res.status(201).json(respObj({ data: result }));
  } catch (e) {
    next(e);
  }
};

export const updateProcessValues = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await processService.updateProcessValues(
      req.tenantUser.tenant as string,
      req.params.id as string,
      req.body.values,
    );
    res.json(respObj({ data: result }));
  } catch (e) {
    next(e);
  }
};

export const updateProcessStage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await processService.updateProcessStage(
      req.tenantUser.tenant as string,
      req.params.id as string,
      req.body.stage,
    );
    res.json(respObj({ data: result }));
  } catch (e) {
    next(e);
  }
};

export const listProcessesByCustomer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const items = await processService.listProcessesByCustomer(
      req.tenantUser.tenant as string,
      req.query.customerId as string,
    );
    res.json(respObj({ data: { items } }));
  } catch (e) {
    next(e);
  }
};
