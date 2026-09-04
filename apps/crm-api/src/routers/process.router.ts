import { createProcessSchema, idSchema, updateProcessStageSchema, updateProcessValuesSchema } from '@crm/contracts';
import type { RequestHandler } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import * as processController from '../controllers/process.controller.js';
import { processRateLimit } from '../middlewares/rateLimit.middleware.js';
import { tenantAssignmentCheck } from '../middlewares/tenantAssign.middleware.js';
import { validBody, validParams, validQuery } from '../middlewares/validation.middleware.js';

const processIdParamSchema = z.object({ id: idSchema }).strict();

// `customerId` é string pura (idSchema, sem `z.coerce`) — não sofre o bug do
// Express 5 em validQuery (req.query getter sem cache) que afeta apenas
// campos com transform, como o `z.coerce.number()` de listCustomersQuerySchema
// (ver customer.router.ts). Aqui o valor "coagido" já é idêntico ao valor cru
// da URL, então o middleware compartilhado funciona sem workaround local.
const listProcessesQuerySchema = z.object({ customerId: idSchema }).strict();

export type ProcessRouterDeps = { validToken: RequestHandler };

// Mesmo molde de customer.router.ts: Process é registro do dia a dia do CRM,
// qualquer papel autenticado do tenant cria/atualiza/lista (CORE-14), sem
// gate isAdmin.
export const createProcessRouter = (deps: ProcessRouterDeps): Router => {
  const router = Router();

  router.post(
    '/',
    deps.validToken,
    tenantAssignmentCheck,
    processRateLimit,
    validBody(createProcessSchema),
    processController.createProcess,
  );

  router.patch(
    '/:id/values',
    deps.validToken,
    tenantAssignmentCheck,
    processRateLimit,
    validParams(processIdParamSchema),
    validBody(updateProcessValuesSchema),
    processController.updateProcessValues,
  );

  router.patch(
    '/:id/stage',
    deps.validToken,
    tenantAssignmentCheck,
    processRateLimit,
    validParams(processIdParamSchema),
    validBody(updateProcessStageSchema),
    processController.updateProcessStage,
  );

  router.get(
    '/',
    deps.validToken,
    tenantAssignmentCheck,
    validQuery(listProcessesQuerySchema),
    processController.listProcessesByCustomer,
  );

  return router;
};
