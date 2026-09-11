import { createProfessionalSchema, idSchema, updateProfessionalSchema } from '@crm/contracts';
import type { RequestHandler } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import * as professionalController from '../controllers/professional.controller.js';
import { checkRole } from '../middlewares/authorization.middleware.js';
import { tenantAssignmentCheck } from '../middlewares/tenantAssign.middleware.js';
import { validBody, validParams } from '../middlewares/validation.middleware.js';

// spec.md SCH-07: mesmo canOperate já usado em product.router.ts/process.router.ts.
const canOperate = checkRole(['admin', 'gestor', 'operador']);

const professionalIdParamSchema = z.object({ id: idSchema }).strict();

// `active` chega como string na query ('true'/'false') — mesmo enum+transform
// de validListProductsQuery (product.router.ts): z.coerce.boolean() trataria
// QUALQUER string não vazia (inclusive 'false') como true.
const listProfessionalsQuerySchema = z
  .object({
    page: z.coerce.number().optional(),
    limit: z.coerce.number().optional(),
    active: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
  })
  .strict();

// Mesmo workaround de validListProductsQuery (product.router.ts): no Express
// 5, req.query é um getter sem cache — Object.assign de
// validQuery/validation.middleware.ts se perde antes do controller ler de
// novo. Aqui req.query é substituído por um valor gravável de fato.
const validListProfessionalsQuery: RequestHandler = (req, _res, next) => {
  const result = listProfessionalsQuerySchema.safeParse(req.query);
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

export type ProfessionalRouterDeps = { validToken: RequestHandler };

export const createProfessionalRouter = (deps: ProfessionalRouterDeps): Router => {
  const router = Router();

  router.post(
    '/',
    deps.validToken,
    tenantAssignmentCheck,
    canOperate,
    validBody(createProfessionalSchema),
    professionalController.createProfessional,
  );

  router.get(
    '/',
    deps.validToken,
    tenantAssignmentCheck,
    canOperate,
    validListProfessionalsQuery,
    professionalController.listProfessionals,
  );

  router.get(
    '/:id',
    deps.validToken,
    tenantAssignmentCheck,
    canOperate,
    validParams(professionalIdParamSchema),
    professionalController.getProfessionalById,
  );

  router.patch(
    '/:id',
    deps.validToken,
    tenantAssignmentCheck,
    canOperate,
    validParams(professionalIdParamSchema),
    validBody(updateProfessionalSchema),
    professionalController.updateProfessional,
  );

  return router;
};
