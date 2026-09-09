import { idSchema, rejectOrderSchema } from '@crm/contracts';
import type { RequestHandler } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import * as orderController from '../controllers/order.controller.js';
import { checkRole } from '../middlewares/authorization.middleware.js';
import { tenantAssignmentCheck } from '../middlewares/tenantAssign.middleware.js';
import { validBody, validParams } from '../middlewares/validation.middleware.js';

// spec.md Assumptions ("Papel exigido... aprovar/rejeitar"): qualquer
// operador do tenant (canOperate), não só o assignee da conversa — mesmo
// papel já usado em product.router.ts/conversation.router.ts.
const canOperate = checkRole(['admin', 'gestor', 'operador']);

const orderIdParamSchema = z.object({ id: idSchema }).strict();

// spec.md AC1 (P1 "Operador aprova ou rejeita"): "filtro por status (default
// pending_approval)" — o default vive aqui (na borda HTTP), não no
// repository (T8, que default é "nenhum — todos" quando chamado
// diretamente).
const listOrdersQuerySchema = z
  .object({
    status: z.enum(['pending_approval', 'confirmed', 'rejected', 'payment_expired']).default('pending_approval'),
    conversation: z.string().trim().optional(),
    page: z.coerce.number().optional(),
    limit: z.coerce.number().optional(),
  })
  .strict();

// Mesmo workaround de validListProductsQuery (product.router.ts): no
// Express 5, req.query é um getter sem cache — Object.assign de
// validQuery/validation.middleware.ts se perde antes do controller ler de
// novo. Aqui req.query é substituído por um valor gravável de fato.
const validListOrdersQuery: RequestHandler = (req, _res, next) => {
  const result = listOrdersQuerySchema.safeParse(req.query);
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

export type OrderRouterDeps = { validToken: RequestHandler };

export const createOrderRouter = (deps: OrderRouterDeps): Router => {
  const router = Router();

  router.get('/', deps.validToken, tenantAssignmentCheck, canOperate, validListOrdersQuery, orderController.listOrders);

  router.post(
    '/:id/approve',
    deps.validToken,
    tenantAssignmentCheck,
    canOperate,
    validParams(orderIdParamSchema),
    orderController.approveOrder,
  );

  router.post(
    '/:id/reject',
    deps.validToken,
    tenantAssignmentCheck,
    canOperate,
    validParams(orderIdParamSchema),
    validBody(rejectOrderSchema),
    orderController.rejectOrder,
  );

  return router;
};
