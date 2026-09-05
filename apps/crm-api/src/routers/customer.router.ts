import { createCustomerSchema, idSchema } from '@crm/contracts';
import type { RequestHandler } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import * as customerController from '../controllers/customer.controller.js';
import { customerRateLimit } from '../middlewares/rateLimit.middleware.js';
import { tenantAssignmentCheck } from '../middlewares/tenantAssign.middleware.js';
import { validBody, validParams } from '../middlewares/validation.middleware.js';

// Mesmo padrão de templateIdParamSchema em fieldTemplate.router.ts.
const customerIdParamSchema = z.object({ id: idSchema }).strict();

// page/limit não têm min/max aqui de propósito: o clamp de CORE-12 é
// responsabilidade do service (customer.service.ts, T13) — a query aceita
// qualquer número e deixa o service decidir o que fazer com valores fora dos
// limites (200 clampado, nunca 400).
const listCustomersQuerySchema = z
  .object({
    page: z.coerce.number().optional(),
    limit: z.coerce.number().optional(),
    q: z.string().trim().optional(),
    sort: z.enum(['name', 'createdAt']).optional(),
    order: z.enum(['asc', 'desc']).optional(),
    status: z.string().trim().optional(),
  })
  .strict();

// Workaround local, só nesta rota: o `validQuery` compartilhado
// (middlewares/validation.middleware.ts) faz `Object.assign(req.query,
// result.data)`, mas no Express 5 `req.query` é um getter SEM cache (reparseia
// `req.url` a cada acesso — apps/crm-api usa express@5.2.1) — a mutação se
// perde antes do controller ler de novo, então um `z.coerce.number()` nunca
// sobrevive (confirmado: `page`/`limit` chegavam como string no controller).
// Isso é um bug pré-existente da infra compartilhada (fora do "Where" desta
// task); aqui só substituímos `req.query` por um valor gravável de fato via
// `Object.defineProperty`, sem tocar em validation.middleware.ts.
const validListCustomersQuery: RequestHandler = (req, _res, next) => {
  const result = listCustomersQuerySchema.safeParse(req.query);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'query'}: ${issue.message}`)
      .join('; ');
    next(Object.assign(new Error(message), { status: 400 }));
    return;
  }
  Object.defineProperty(req, 'query', { value: result.data, configurable: true, enumerable: true, writable: true });
  next();
};

export type CustomerRouterDeps = { validToken: RequestHandler };

// Ao contrário de field-template (mutação estrutural, admin-only), Customer é
// registro do dia a dia do CRM — qualquer papel autenticado do tenant cria e
// lista (CORE-14), sem gate `isAdmin`.
export const createCustomerRouter = (deps: CustomerRouterDeps): Router => {
  const router = Router();

  router.post(
    '/',
    deps.validToken,
    tenantAssignmentCheck,
    customerRateLimit,
    validBody(createCustomerSchema),
    customerController.createCustomer,
  );

  router.get('/', deps.validToken, tenantAssignmentCheck, validListCustomersQuery, customerController.listCustomers);

  router.get(
    '/:id',
    deps.validToken,
    tenantAssignmentCheck,
    validParams(customerIdParamSchema),
    customerController.getCustomerById,
  );

  return router;
};
