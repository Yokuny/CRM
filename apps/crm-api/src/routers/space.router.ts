import { createSpaceSchema, idSchema, updateSpaceSchema } from '@crm/contracts';
import type { RequestHandler } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import * as spaceController from '../controllers/space.controller.js';
import { checkRole } from '../middlewares/authorization.middleware.js';
import { tenantAssignmentCheck } from '../middlewares/tenantAssign.middleware.js';
import { validBody, validParams } from '../middlewares/validation.middleware.js';

// spec.md SCH-07: mesmo canOperate já usado em product.router.ts/professional.router.ts.
const canOperate = checkRole(['admin', 'gestor', 'operador']);

const spaceIdParamSchema = z.object({ id: idSchema }).strict();

// `active` chega como string na query ('true'/'false') — mesmo enum+transform
// de validListProfessionalsQuery (professional.router.ts).
const listSpacesQuerySchema = z
  .object({
    page: z.coerce.number().optional(),
    limit: z.coerce.number().optional(),
    active: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
  })
  .strict();

// Mesmo workaround de validListProfessionalsQuery (professional.router.ts):
// no Express 5, req.query é um getter sem cache — Object.assign de
// validQuery/validation.middleware.ts se perde antes do controller ler de
// novo. Aqui req.query é substituído por um valor gravável de fato.
const validListSpacesQuery: RequestHandler = (req, _res, next) => {
  const result = listSpacesQuerySchema.safeParse(req.query);
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

export type SpaceRouterDeps = { validToken: RequestHandler };

export const createSpaceRouter = (deps: SpaceRouterDeps): Router => {
  const router = Router();

  router.post(
    '/',
    deps.validToken,
    tenantAssignmentCheck,
    canOperate,
    validBody(createSpaceSchema),
    spaceController.createSpace,
  );

  router.get('/', deps.validToken, tenantAssignmentCheck, canOperate, validListSpacesQuery, spaceController.listSpaces);

  router.get(
    '/:id',
    deps.validToken,
    tenantAssignmentCheck,
    canOperate,
    validParams(spaceIdParamSchema),
    spaceController.getSpaceById,
  );

  router.patch(
    '/:id',
    deps.validToken,
    tenantAssignmentCheck,
    canOperate,
    validParams(spaceIdParamSchema),
    validBody(updateSpaceSchema),
    spaceController.updateSpace,
  );

  return router;
};
