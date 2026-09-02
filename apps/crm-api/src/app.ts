import { respObj } from '@crm/contracts';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import { env } from './config/env.config.js';
import { errorHandler } from './middlewares/errorHandler.middleware.js';
import { responseTime } from './middlewares/responseTime.middleware.js';

// Sem .listen() — testável via supertest sem abrir porta. start() (server.ts)
// é quem efetivamente sobe o processo.
export const buildApp = (): Express => {
  const app = express();

  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(cookieParser());
  app.use(express.json());
  app.use(responseTime);

  app.get('/health', (_req, res) => {
    res.json(respObj({ data: { service: 'crm-api' } }));
  });

  app.use(errorHandler);

  return app;
};
