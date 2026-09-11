import { respObj } from '@crm/contracts';
import type { NextFunction, Request, Response } from 'express';
import * as schedulingSettingsService from '../services/schedulingSettings.service.js';

// O Tenant vem sempre de req.tenantUser (AD-010), nunca do corpo/query —
// mesma convenção de space.controller.ts. Sem tradução de erro: "não
// configurado ainda" nunca é um erro (spec.md SCH-06), e o PUT sempre
// resolve via upsert (T18).
export const getSchedulingSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await schedulingSettingsService.getSchedulingSettings(req.tenantUser.tenant as string);
    res.json(respObj({ data: result }));
  } catch (e) {
    next(e);
  }
};

export const updateSchedulingSettings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await schedulingSettingsService.updateSchedulingSettings(
      req.tenantUser.tenant as string,
      req.body,
    );
    res.json(respObj({ data: result }));
  } catch (e) {
    next(e);
  }
};
