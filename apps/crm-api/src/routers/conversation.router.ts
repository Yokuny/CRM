import { idSchema, sendMessageSchema } from '@crm/contracts';
import type { RequestHandler } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import * as conversationController from '../controllers/conversation.controller.js';
import { checkRole } from '../middlewares/authorization.middleware.js';
import { tenantAssignmentCheck } from '../middlewares/tenantAssign.middleware.js';
import { validBody, validParams } from '../middlewares/validation.middleware.js';

const conversationIdParamSchema = z.object({ id: idSchema }).strict();

// spec.md "Papel exigido nos 3 endpoints headless": takeover/liberar/enviar
// são ações operacionais (CORE-14) — qualquer papel autenticado do tenant,
// nunca isAdmin (esse gate é só para Channel, ver channel.router.ts).
const canOperate = checkRole(['admin', 'gestor', 'operador']);

export type ConversationRouterDeps = { validToken: RequestHandler };

export const createConversationRouter = (deps: ConversationRouterDeps): Router => {
  const router = Router();

  router.post(
    '/:id/takeover',
    deps.validToken,
    tenantAssignmentCheck,
    canOperate,
    validParams(conversationIdParamSchema),
    conversationController.takeoverConversation,
  );

  router.post(
    '/:id/release',
    deps.validToken,
    tenantAssignmentCheck,
    canOperate,
    validParams(conversationIdParamSchema),
    conversationController.releaseConversation,
  );

  router.post(
    '/:id/messages',
    deps.validToken,
    tenantAssignmentCheck,
    canOperate,
    validParams(conversationIdParamSchema),
    validBody(sendMessageSchema),
    conversationController.sendManualMessage,
  );

  return router;
};
