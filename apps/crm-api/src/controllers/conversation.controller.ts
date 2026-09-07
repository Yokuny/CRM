import type { SendMessage } from '@crm/contracts';
import { respObj } from '@crm/contracts';
import type { NextFunction, Request, Response } from 'express';
import * as conversationService from '../services/conversation.service.js';

// O Tenant vem sempre de req.tenantUser (AD-010), o assignee de takeover vem
// do usuário autenticado (req.tenantUser.user) — nunca do corpo ou da query,
// mesma convenção de customer.controller.ts.
export const takeoverConversation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await conversationService.takeoverConversation(
      req.params.id as string,
      req.tenantUser.tenant as string,
      req.tenantUser.user as string,
    );
    res.json(respObj({ data: result }));
  } catch (e) {
    next(e);
  }
};

export const releaseConversation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await conversationService.releaseConversation(
      req.params.id as string,
      req.tenantUser.tenant as string,
    );
    res.json(respObj({ data: result }));
  } catch (e) {
    next(e);
  }
};

export const sendManualMessage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await conversationService.sendManualMessage(
      req.params.id as string,
      req.tenantUser.tenant as string,
      req.body as SendMessage,
    );
    res.status(201).json(respObj({ data: result }));
  } catch (e) {
    next(e);
  }
};
