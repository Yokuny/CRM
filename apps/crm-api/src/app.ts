import { respObj } from '@crm/contracts';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import nodemailer from 'nodemailer';
import { buildAuthDeps } from './authDeps.js';
import { env } from './config/env.config.js';
import { createAuthMiddleware } from './middlewares/authentication.middleware.js';
import { errorHandler } from './middlewares/errorHandler.middleware.js';
import { responseTime } from './middlewares/responseTime.middleware.js';
import { createCustomerFieldValueStore } from './providers/fieldValueStore/customer.fieldValueStore.js';
import { createProcessFieldValueStore } from './providers/fieldValueStore/process.fieldValueStore.js';
import type { MailProvider } from './providers/mail/index.js';
import { createLogMailProvider } from './providers/mail/log.mailProvider.js';
import { createNodemailerMailProvider } from './providers/mail/nodemailer.mailProvider.js';
import { createAuthRouter } from './routers/auth.router.js';
import { createChannelRouter } from './routers/channel.router.js';
import { createConversationRouter } from './routers/conversation.router.js';
import { createCustomerRouter } from './routers/customer.router.js';
import { createFieldTemplateRouter } from './routers/fieldTemplate.router.js';
import { inviteRouter } from './routers/invite.router.js';
import { createOrderRouter } from './routers/order.router.js';
import { createPlatformRouter } from './routers/platform.router.js';
import { createProcessRouter } from './routers/process.router.js';
import { createProductRouter } from './routers/product.router.js';
import type { FieldValueStores } from './services/fieldTemplate.service.js';

const buildMailProvider = (): MailProvider => {
  if (env.MAIL_PROVIDER === 'nodemailer') {
    const transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ? Number(env.SMTP_PORT) : undefined,
      auth: env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
    return createNodemailerMailProvider(transport, env.SMTP_FROM ?? '');
  }
  return createLogMailProvider();
};

// Sem .listen() — testável via supertest sem abrir porta. start() (server.ts)
// é quem efetivamente sobe o processo.
export const buildApp = (): Express => {
  const app = express();

  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(cookieParser());
  app.use(express.json());
  app.use(responseTime);

  const { validToken } = createAuthMiddleware(buildAuthDeps());
  const mailProvider = buildMailProvider();
  const inviteBaseUrl = `${env.CORS_ORIGIN}/invite`;

  // Um store por targetType (AD-021). Adapters reais sobre `customers`/
  // `processes` agora que os dois módulos existem (T10/T11) — troca só esta
  // injeção, sem tocar em fieldTemplate.service.ts.
  const fieldValueStores: FieldValueStores = {
    customer: createCustomerFieldValueStore(),
    process: createProcessFieldValueStore(),
  };

  app.get('/health', (_req, res) => {
    res.json(respObj({ data: { service: 'crm-api' } }));
  });

  app.use('/platform', createPlatformRouter({ validToken, mailProvider, inviteBaseUrl }));
  app.use('/invites', inviteRouter);
  app.use('/auth', createAuthRouter({ validToken }));
  app.use('/field-templates', createFieldTemplateRouter({ validToken, fieldValueStores }));
  app.use('/customers', createCustomerRouter({ validToken }));
  app.use('/processes', createProcessRouter({ validToken }));
  app.use('/products', createProductRouter({ validToken }));
  app.use('/orders', createOrderRouter({ validToken }));
  app.use('/channels', createChannelRouter({ validToken }));
  app.use('/conversations', createConversationRouter({ validToken }));

  app.use(errorHandler);

  return app;
};
