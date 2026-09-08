import { idSchema, sendMessageSchema } from '@crm/contracts';
import type { RequestHandler } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import * as conversationController from '../controllers/conversation.controller.js';
import { checkRole } from '../middlewares/authorization.middleware.js';
import { tenantAssignmentCheck } from '../middlewares/tenantAssign.middleware.js';
import { validBody, validParams } from '../middlewares/validation.middleware.js';

const conversationIdParamSchema = z.object({ id: idSchema }).strict();
const resendMessageParamSchema = z.object({ id: idSchema, messageId: idSchema }).strict();

// spec.md "Papel exigido nos 3 endpoints headless": takeover/liberar/enviar
// são ações operacionais (CORE-14) — qualquer papel autenticado do tenant,
// nunca isAdmin (esse gate é só para Channel, ver channel.router.ts). Mesmo
// papel (canOperate) exigido em GET /conversations (INBOX-02).
const canOperate = checkRole(['admin', 'gestor', 'operador']);

const listConversationsQuerySchema = z
  .object({
    mode: z.enum(['bot', 'human']).optional(),
    assignee: z.string().trim().optional(),
    page: z.coerce.number().optional(),
    limit: z.coerce.number().optional(),
  })
  .strict();

// Mesmo workaround de validListCustomersQuery (customer.router.ts:29-42): no
// Express 5, req.query é um getter sem cache — Object.assign de
// validQuery/validation.middleware.ts se perde antes do controller ler de
// novo. Aqui req.query é substituído por um valor gravável de fato.
const validListConversationsQuery: RequestHandler = (req, _res, next) => {
  const result = listConversationsQuerySchema.safeParse(req.query);
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

const getMessagesQuerySchema = z
  .object({
    page: z.coerce.number().optional(),
    limit: z.coerce.number().optional(),
  })
  .strict();

// Mesmo workaround de validListConversationsQuery (acima) — req.query em
// Express 5 é um getter sem cache.
const validGetMessagesQuery: RequestHandler = (req, _res, next) => {
  const result = getMessagesQuerySchema.safeParse(req.query);
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

export type ConversationRouterDeps = { validToken: RequestHandler };

export const createConversationRouter = (deps: ConversationRouterDeps): Router => {
  const router = Router();

  router.get(
    '/',
    deps.validToken,
    tenantAssignmentCheck,
    canOperate,
    validListConversationsQuery,
    conversationController.listConversations,
  );

  router.get(
    '/:id/messages',
    deps.validToken,
    tenantAssignmentCheck,
    canOperate,
    validParams(conversationIdParamSchema),
    validGetMessagesQuery,
    conversationController.getMessages,
  );

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

  router.post(
    '/:id/messages/:messageId/resend',
    deps.validToken,
    tenantAssignmentCheck,
    canOperate,
    validParams(resendMessageParamSchema),
    conversationController.resendMessage,
  );

  // INBOX-17/18: mesmo par de params de resendMessageParamSchema (id +
  // messageId) — canOperate roda ANTES do controller, então uma sessão sem
  // papel nunca chega a chamar a Meta (spec.md P2/AC4).
  router.get(
    '/:id/messages/:messageId/media',
    deps.validToken,
    tenantAssignmentCheck,
    canOperate,
    validParams(resendMessageParamSchema),
    conversationController.getMessageMedia,
  );

  return router;
};
