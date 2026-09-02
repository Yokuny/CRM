import { acceptInviteSchema, inviteTokenParamSchema } from '@crm/contracts';
import { Router } from 'express';
import * as inviteController from '../controllers/invite.controller.js';
import { validBody, validParams } from '../middlewares/validation.middleware.js';

// Totalmente público — nenhum validToken aqui (FND-03/AC1).
export const inviteRouter = Router();

inviteRouter.get('/:token', validParams(inviteTokenParamSchema), inviteController.peekInvite);
inviteRouter.post(
  '/:token/accept',
  validParams(inviteTokenParamSchema),
  validBody(acceptInviteSchema),
  inviteController.acceptInvite,
);
