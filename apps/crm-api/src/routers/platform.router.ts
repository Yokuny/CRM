import { createInviteSchema, idSchema, provisionTenantSchema } from '@crm/contracts';
import type { RequestHandler } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { createPlatformController, type PlatformControllerDeps } from '../controllers/platform.controller.js';
import { platformAdminOnly } from '../middlewares/authorization.middleware.js';
import { inviteRateLimit } from '../middlewares/rateLimit.middleware.js';
import { validBody, validParams } from '../middlewares/validation.middleware.js';

const tenantIdParamSchema = z.object({ id: idSchema }).strict();

export type PlatformRouterDeps = PlatformControllerDeps & { validToken: RequestHandler };

// platformAdminOnly antes de QUALQUER outro middleware de negócio — 403 sem
// tocar dados (FND-01/AC3); validToken vem primeiro porque platformAdminOnly
// só lê req.tenantUser, já resolvido do banco.
export const createPlatformRouter = (deps: PlatformRouterDeps): Router => {
  const controller = createPlatformController(deps);
  const router = Router();

  router.post(
    '/tenants',
    deps.validToken,
    platformAdminOnly,
    validBody(provisionTenantSchema),
    controller.provisionTenant,
  );

  router.post(
    '/tenants/:id/invites',
    deps.validToken,
    platformAdminOnly,
    inviteRateLimit,
    validParams(tenantIdParamSchema),
    validBody(createInviteSchema),
    controller.inviteToTenant,
  );

  return router;
};
