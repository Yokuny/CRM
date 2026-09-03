import { respObj } from '@crm/contracts';
import express, { type Express } from 'express';

// Esqueleto: só /health, para que AD-002 (dois serviços, dois /health) valha
// desde a feature 1. Sem .listen() — testável via supertest sem abrir porta,
// mesmo padrão de apps/crm-api/src/app.ts (T20).
//
// SPEC_DEVIATION: db:'up' é um literal estático, não uma checagem ao vivo da
// conexão. buildApp() não conecta (isso é start(), em server.ts) e uma
// checagem ao vivo exigiria importar o driver Mongo diretamente em apps/** —
// proibido pelo teste estrutural de AD-010 — ou uma nova exportação em
// packages/db, fora do escopo desta task. O /health do crm-api (T20) também
// não verifica o banco; este segue o mesmo nível mínimo.
export const buildApp = (): Express => {
  const app = express();

  app.get('/health', (_req, res) => {
    res.json(respObj({ data: { service: 'ai-gateway', db: 'up' } }));
  });

  return app;
};
