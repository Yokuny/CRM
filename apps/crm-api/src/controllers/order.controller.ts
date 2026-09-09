import { respObj } from '@crm/contracts';
import type { NextFunction, Request, Response } from 'express';
import { CustomError } from '../middlewares/errorHandler.middleware.js';
import type { ListOrdersQuery } from '../services/order.service.js';
import * as orderService from '../services/order.service.js';
import { OrderAlreadyTerminalError, OrderNotFoundError } from '../services/order.service.js';

// O Tenant vem sempre de req.tenantUser (AD-010), nunca do corpo/query —
// mesma convenção de product.controller.ts. `status`/`conversation` já
// validados/coercidos por validListOrdersQuery (router, default
// 'pending_approval' quando status é omitido — spec.md AC1).
export const listOrders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await orderService.listOrders(
      req.tenantUser.tenant as string,
      req.query as unknown as ListOrdersQuery,
    );
    res.json(respObj({ data: result }));
  } catch (e) {
    next(e);
  }
};

// spec.md P1 "Operador aprova ou rejeita"/AC1/AC4: qualquer operador do
// tenant (canOperate, não só o assignee da conversa) — o userId vem sempre
// de req.tenantUser.user, nunca do corpo. Traduz os erros tipados do service
// (T9) pro código HTTP certo (design.md Error Handling Strategy):
// OrderNotFoundError->404, OrderAlreadyTerminalError->409.
export const approveOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await orderService.approveOrder(
      req.tenantUser.tenant as string,
      req.params.id as string,
      req.tenantUser.user as string,
    );
    res.json(respObj({ data: result }));
  } catch (e) {
    if (e instanceof OrderNotFoundError) {
      next(new CustomError(e.message, 404));
      return;
    }
    if (e instanceof OrderAlreadyTerminalError) {
      next(new CustomError(e.message, 409));
      return;
    }
    next(e);
  }
};

// spec.md AC6: `reason` opcional, já validado por rejectOrderSchema (router).
export const rejectOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await orderService.rejectOrder(
      req.tenantUser.tenant as string,
      req.params.id as string,
      req.tenantUser.user as string,
      (req.body as { reason?: string }).reason,
    );
    res.json(respObj({ data: result }));
  } catch (e) {
    if (e instanceof OrderNotFoundError) {
      next(new CustomError(e.message, 404));
      return;
    }
    if (e instanceof OrderAlreadyTerminalError) {
      next(new CustomError(e.message, 409));
      return;
    }
    next(e);
  }
};
