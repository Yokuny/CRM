import { respObj } from '@crm/contracts';
import { Session, Tenant, User } from '@crm/db';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import nodemailer from 'nodemailer';
import { env } from './config/env.config.js';
import type { AuthDeps } from './middlewares/authentication.middleware.js';
import { createAuthMiddleware } from './middlewares/authentication.middleware.js';
import { errorHandler } from './middlewares/errorHandler.middleware.js';
import { responseTime } from './middlewares/responseTime.middleware.js';
import type { MailProvider } from './providers/mail/index.js';
import { createLogMailProvider } from './providers/mail/log.mailProvider.js';
import { createNodemailerMailProvider } from './providers/mail/nodemailer.mailProvider.js';
import { createPlatformRouter } from './routers/platform.router.js';

// Adaptador real de AuthDeps sobre @crm/db — a única fonte de req.tenantUser
// (FND-05). Construído aqui (composition root) e reusado por toda rota que
// exige sessão, para nunca duplicar a leitura do banco entre módulos.
const authDeps: AuthDeps = {
  findSessionByHash: async (tokenHash) => {
    const session = await Session.findOne({ tokenHash }).lean();
    return session ? { user: session.user.toString(), deviceInfo: session.deviceInfo } : null;
  },
  revokeAllSessions: async (userId) => {
    await Session.deleteMany({ user: userId });
  },
  getUserById: async (userId) => {
    const user = await User.findById(userId).lean();
    return user
      ? {
          id: user._id.toString(),
          tenant: user.Tenant?.toString(),
          role: user.role,
          isPlatformAdmin: user.isPlatformAdmin,
          active: user.active,
        }
      : null;
  },
  getTenantById: async (tenantId) => {
    const tenant = await Tenant.findById(tenantId).lean();
    return tenant ? { id: tenant._id.toString(), name: tenant.name, status: tenant.status } : null;
  },
};

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

  const { validToken } = createAuthMiddleware(authDeps);
  const mailProvider = buildMailProvider();
  const inviteBaseUrl = `${env.CORS_ORIGIN}/invite`;

  app.get('/health', (_req, res) => {
    res.json(respObj({ data: { service: 'crm-api' } }));
  });

  app.use('/platform', createPlatformRouter({ validToken, mailProvider, inviteBaseUrl }));

  app.use(errorHandler);

  return app;
};
