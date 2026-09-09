import { createProductSchema, idSchema, updateProductSchema } from '@crm/contracts';
import type { RequestHandler } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import * as productController from '../controllers/product.controller.js';
import { checkRole } from '../middlewares/authorization.middleware.js';
import { tenantAssignmentCheck } from '../middlewares/tenantAssign.middleware.js';
import { validBody, validParams } from '../middlewares/validation.middleware.js';

// spec.md Assumptions ("Papel exigido nos novos endpoints"): mesmo canOperate
// já usado em conversation.router.ts/process.router.ts.
const canOperate = checkRole(['admin', 'gestor', 'operador']);

const productIdParamSchema = z.object({ id: idSchema }).strict();

// `active` chega como string na query ('true'/'false') — z.coerce.boolean()
// trataria QUALQUER string não vazia (inclusive 'false') como true, então o
// enum+transform explícito é necessário aqui.
const listProductsQuerySchema = z
  .object({
    page: z.coerce.number().optional(),
    limit: z.coerce.number().optional(),
    name: z.string().trim().optional(),
    active: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
  })
  .strict();

// Mesmo workaround de validListCustomersQuery (customer.router.ts): no
// Express 5, req.query é um getter sem cache — Object.assign de
// validQuery/validation.middleware.ts se perde antes do controller ler de
// novo. Aqui req.query é substituído por um valor gravável de fato.
const validListProductsQuery: RequestHandler = (req, _res, next) => {
  const result = listProductsQuerySchema.safeParse(req.query);
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

export type ProductRouterDeps = { validToken: RequestHandler };

export const createProductRouter = (deps: ProductRouterDeps): Router => {
  const router = Router();

  router.post(
    '/',
    deps.validToken,
    tenantAssignmentCheck,
    canOperate,
    validBody(createProductSchema),
    productController.createProduct,
  );

  router.get(
    '/',
    deps.validToken,
    tenantAssignmentCheck,
    canOperate,
    validListProductsQuery,
    productController.listProducts,
  );

  router.patch(
    '/:id',
    deps.validToken,
    tenantAssignmentCheck,
    canOperate,
    validParams(productIdParamSchema),
    validBody(updateProductSchema),
    productController.updateProduct,
  );

  return router;
};
