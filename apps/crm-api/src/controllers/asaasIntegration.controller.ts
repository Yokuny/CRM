import type { CreateAsaasIntegration } from '@crm/contracts';
import { respObj } from '@crm/contracts';
import type { NextFunction, Request, Response } from 'express';
import * as asaasIntegrationService from '../services/asaasIntegration.service.js';

// O Tenant vem sempre de req.tenantUser (AD-010) — nunca do corpo, mesma
// convenção de channel.controller.ts.
export const createIntegration = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await asaasIntegrationService.createIntegration(
      req.tenantUser.tenant as string,
      req.body as CreateAsaasIntegration,
    );
    res.status(201).json(respObj({ data: result }));
  } catch (e) {
    next(e);
  }
};

export const getCurrentIntegration = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await asaasIntegrationService.getCurrentIntegration(req.tenantUser.tenant as string);
    res.json(respObj({ data: result }));
  } catch (e) {
    next(e);
  }
};
