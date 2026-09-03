import {
  bumpFieldTemplateSchema,
  createFieldTemplateSchema,
  FIELD_TEMPLATE_TARGET_TYPES,
  idSchema,
} from '@crm/contracts';
import type { RequestHandler } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import {
  createFieldTemplateController,
  type FieldTemplateControllerDeps,
} from '../controllers/fieldTemplate.controller.js';
import { isAdmin } from '../middlewares/authorization.middleware.js';
import { fieldTemplateRateLimit } from '../middlewares/rateLimit.middleware.js';
import { tenantAssignmentCheck } from '../middlewares/tenantAssign.middleware.js';
import { validBody, validParams, validQuery } from '../middlewares/validation.middleware.js';

const templateIdParamSchema = z.object({ id: idSchema }).strict();

const currentTemplateQuerySchema = z
  .object({ targetType: z.enum(FIELD_TEMPLATE_TARGET_TYPES), key: z.string().trim().min(1).max(60) })
  .strict();

export type FieldTemplateRouterDeps = FieldTemplateControllerDeps & { validToken: RequestHandler };

// Mutação estrutural é ação de admin (FLD-07): isAdmin roda antes de qualquer
// validação de corpo ou acesso a dados, então o 403 nunca toca o banco. A
// leitura é liberada para qualquer papel do tenant.
export const createFieldTemplateRouter = (deps: FieldTemplateRouterDeps): Router => {
  const controller = createFieldTemplateController(deps);
  const router = Router();

  router.post(
    '/',
    deps.validToken,
    tenantAssignmentCheck,
    isAdmin,
    fieldTemplateRateLimit,
    validBody(createFieldTemplateSchema),
    controller.createFieldTemplate,
  );

  router.get(
    '/current',
    deps.validToken,
    tenantAssignmentCheck,
    validQuery(currentTemplateQuerySchema),
    controller.getCurrentTemplate,
  );

  router.post(
    '/:id/versions',
    deps.validToken,
    tenantAssignmentCheck,
    isAdmin,
    fieldTemplateRateLimit,
    validParams(templateIdParamSchema),
    validBody(bumpFieldTemplateSchema),
    controller.bumpFieldTemplateVersion,
  );

  router.post(
    '/:id/archive',
    deps.validToken,
    tenantAssignmentCheck,
    isAdmin,
    fieldTemplateRateLimit,
    validParams(templateIdParamSchema),
    controller.archiveFieldTemplate,
  );

  return router;
};
