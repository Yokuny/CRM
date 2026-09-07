import type { CreateChannel } from '@crm/contracts';
import { respObj } from '@crm/contracts';
import type { NextFunction, Request, Response } from 'express';
import { CustomError } from '../middlewares/errorHandler.middleware.js';
import * as channelService from '../services/channel.service.js';

const DUPLICATE_KEY_CODE = 11000;

// Mesmo idioma de packages/ai-kit/src/ingest.ts (isDuplicateKeyError) — erro
// bruto do driver Mongo, nunca reconstruído a partir da mensagem.
const isDuplicateKeyError = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === DUPLICATE_KEY_CODE;

// O Tenant vem sempre de req.tenantUser (AD-010) — nunca do corpo, mesma
// convenção de customer.controller.ts.
export const createChannel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await channelService.createChannel(req.tenantUser.tenant as string, req.body as CreateChannel);
    res.status(201).json(respObj({ data: result }));
  } catch (e) {
    // AIG-02: phoneNumberId duplicado vira 409 aqui — o repository (T33)
    // só propaga o erro bruto do Mongo, nunca decide o código HTTP.
    next(isDuplicateKeyError(e) ? new CustomError('phoneNumberId já está em uso', 409) : e);
  }
};

export const getCurrentChannel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await channelService.getCurrentChannel(req.tenantUser.tenant as string);
    res.json(respObj({ data: result }));
  } catch (e) {
    next(e);
  }
};
