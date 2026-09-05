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

// WEB-08 (T25B): `z.coerce.number()` aqui é seguro — `req.params` é um objeto
// gravável comum em Express 5 (ao contrário de `req.query`, que é um getter
// sem cache; ver customer.router.ts/validation.middleware.ts), então
// `validParams`'s `Object.assign(req.params, result.data)` persiste a
// transformação normalmente, sem o workaround local que `listCustomersQuerySchema`
// precisou.
const templateVersionParamSchema = z.object({ id: idSchema, version: z.coerce.number().int().positive() }).strict();

const currentTemplateQuerySchema = z
  .object({ targetType: z.enum(FIELD_TEMPLATE_TARGET_TYPES), key: z.string().trim().min(1).max(60) })
  .strict();

const listTemplatesQuerySchema = z.object({ targetType: z.enum(FIELD_TEMPLATE_TARGET_TYPES) }).strict();

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

  // WEB-07: descoberta de templates para o seletor de "novo Process" — leitura
  // liberada para qualquer papel do tenant, sem isAdmin (mesmo precedente de
  // GET /current).
  router.get(
    '/',
    deps.validToken,
    tenantAssignmentCheck,
    validQuery(listTemplatesQuerySchema),
    controller.listTemplates,
  );

  router.get(
    '/current',
    deps.validToken,
    tenantAssignmentCheck,
    validQuery(currentTemplateQuerySchema),
    controller.getCurrentTemplate,
  );

  // WEB-08 (T25B, added 2026-09-05): fetch de UMA versão específica (nunca
  // necessariamente a corrente) — o consumidor é o Process.details do
  // crm-web-shell, validando/renderizando contra a `templateVersion` PRÓPRIA
  // do registro (AD-023). Leitura, sem gate isAdmin (mesmo precedente de
  // GET /current e GET /). Sem colisão de path com POST /:id/versions (bump)
  // — Express casa por método+path juntos.
  router.get(
    '/:id/versions/:version',
    deps.validToken,
    tenantAssignmentCheck,
    validParams(templateVersionParamSchema),
    controller.getTemplateVersion,
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
