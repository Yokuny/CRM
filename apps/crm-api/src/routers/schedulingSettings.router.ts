import { updateSchedulingSettingsSchema } from '@crm/contracts';
import type { RequestHandler } from 'express';
import { Router } from 'express';
import * as schedulingSettingsController from '../controllers/schedulingSettings.controller.js';
import { checkRole } from '../middlewares/authorization.middleware.js';
import { tenantAssignmentCheck } from '../middlewares/tenantAssign.middleware.js';
import { validBody } from '../middlewares/validation.middleware.js';

// spec.md SCH-07: mesmo canOperate já usado em product.router.ts/space.router.ts.
const canOperate = checkRole(['admin', 'gestor', 'operador']);

export type SchedulingSettingsRouterDeps = { validToken: RequestHandler };

export const createSchedulingSettingsRouter = (deps: SchedulingSettingsRouterDeps): Router => {
  const router = Router();

  router.get(
    '/',
    deps.validToken,
    tenantAssignmentCheck,
    canOperate,
    schedulingSettingsController.getSchedulingSettings,
  );

  router.put(
    '/',
    deps.validToken,
    tenantAssignmentCheck,
    canOperate,
    validBody(updateSchedulingSettingsSchema),
    schedulingSettingsController.updateSchedulingSettings,
  );

  return router;
};
