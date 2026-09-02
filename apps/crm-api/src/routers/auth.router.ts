import { signinSchema } from '@crm/contracts';
import type { RequestHandler } from 'express';
import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { signinRateLimit } from '../middlewares/rateLimit.middleware.js';
import { validBody } from '../middlewares/validation.middleware.js';

export type AuthRouterDeps = { validToken: RequestHandler };

export const createAuthRouter = (deps: AuthRouterDeps): Router => {
  const router = Router();

  router.post('/signin', signinRateLimit, validBody(signinSchema), authController.signin);
  router.get('/session', deps.validToken, authController.session);

  return router;
};
