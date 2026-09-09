import { createAsaasIntegrationSchema } from '@crm/contracts';
import type { RequestHandler } from 'express';
import { Router } from 'express';
import * as asaasIntegrationController from '../controllers/asaasIntegration.controller.js';
import { isAdmin } from '../middlewares/authorization.middleware.js';
import { tenantAssignmentCheck } from '../middlewares/tenantAssign.middleware.js';
import { validBody } from '../middlewares/validation.middleware.js';

export type AsaasIntegrationRouterDeps = { validToken: RequestHandler };

// Configurar/ler a integração Asaas lida com a chave do gateway de
// pagamento do tenant — ação de admin (spec.md P1 "Tenant configura sua
// própria chave Asaas"), mesmo padrão isAdmin de channel.router.ts. isAdmin
// roda antes de qualquer validação de corpo ou acesso a dados, então o 403
// nunca toca o banco nem chama o Asaas.
export const createAsaasIntegrationRouter = (deps: AsaasIntegrationRouterDeps): Router => {
  const router = Router();

  router.post(
    '/',
    deps.validToken,
    tenantAssignmentCheck,
    isAdmin,
    validBody(createAsaasIntegrationSchema),
    asaasIntegrationController.createIntegration,
  );

  router.get(
    '/current',
    deps.validToken,
    tenantAssignmentCheck,
    isAdmin,
    asaasIntegrationController.getCurrentIntegration,
  );

  return router;
};
