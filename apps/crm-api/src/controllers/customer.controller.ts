import { respObj } from '@crm/contracts';
import type { NextFunction, Request, Response } from 'express';
import type { ListCustomersQuery } from '../services/customer.service.js';
import * as customerService from '../services/customer.service.js';

// O Tenant vem sempre de req.tenantUser (resolvido do banco pela sessão),
// nunca do corpo ou da query (AD-010/CORE-06) — mesma convenção usada em todo
// controller autenticado do projeto (ex.: fieldTemplate.controller.ts).
// Sem factory/deps aqui: ao contrário de fieldTemplate.controller.ts (que
// injeta fieldValueStores), customer.service não tem dependência composta em
// app.ts — mesmo formato mais simples de auth.controller.ts/invite.controller.ts.
export const createCustomer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await customerService.createCustomer(req.tenantUser.tenant as string, req.body);
    res.status(201).json(respObj({ data: result }));
  } catch (e) {
    next(e);
  }
};

export const listCustomers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await customerService.listCustomers(
      req.tenantUser.tenant as string,
      req.query as unknown as ListCustomersQuery,
    );
    res.json(respObj({ data: result }));
  } catch (e) {
    next(e);
  }
};
