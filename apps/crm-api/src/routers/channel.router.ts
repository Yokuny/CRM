import { createChannelSchema } from '@crm/contracts';
import type { RequestHandler } from 'express';
import { Router } from 'express';
import * as channelController from '../controllers/channel.controller.js';
import { isAdmin } from '../middlewares/authorization.middleware.js';
import { tenantAssignmentCheck } from '../middlewares/tenantAssign.middleware.js';
import { validBody } from '../middlewares/validation.middleware.js';

export type ChannelRouterDeps = { validToken: RequestHandler };

// Provisionar/ler o Channel lida com o token da Meta — ação de admin
// (spec.md "Papel exigido nos 3 endpoints headless"), mesmo padrão isAdmin de
// fieldTemplate.router.ts. isAdmin roda antes de qualquer validação de corpo
// ou acesso a dados, então o 403 nunca toca o banco.
export const createChannelRouter = (deps: ChannelRouterDeps): Router => {
  const router = Router();

  router.post(
    '/',
    deps.validToken,
    tenantAssignmentCheck,
    isAdmin,
    validBody(createChannelSchema),
    channelController.createChannel,
  );

  router.get('/current', deps.validToken, tenantAssignmentCheck, isAdmin, channelController.getCurrentChannel);

  return router;
};
