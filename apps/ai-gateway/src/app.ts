import { createAnthropicClient, createWhisperClient } from '@crm/ai-kit';
import { respObj } from '@crm/contracts';
import express, { type Express } from 'express';
import { env } from './config/env.config.js';
import { createAudioDownloader } from './providers/audioDownloader.js';
import { createWebhookRouter } from './routers/webhook.router.js';

// Sem .listen() — testável via supertest sem abrir porta, mesmo padrão de
// apps/crm-api/src/app.ts (T20).
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

  // AIG-05/06/07/08: única função que este app chama do ai-kit (design.md) —
  // o webhook inteiro (GET handshake + POST síncrono) vive em webhook.router.ts.
  const client = createAnthropicClient(env.ANTHROPIC_API_KEY);
  // P2 (T47): implementações reais injetadas aqui (composition root) — nunca
  // dentro de packages/ai-kit, que só declara os tipos (ingest.ts/
  // whisperClient.ts). audioDownloader.ts usa metaClient.ts (T26) por baixo,
  // criando um client por Channel (token decifrado só no escopo da chamada).
  const downloadAudio = createAudioDownloader(env.CHANNEL_ENC_KEY);
  const whisperClient = createWhisperClient(env.OPENAI_API_KEY);
  app.use(
    '/webhooks/whatsapp',
    createWebhookRouter({
      client,
      verifyToken: env.META_WEBHOOK_VERIFY_TOKEN,
      appSecret: env.META_APP_SECRET,
      downloadAudio,
      whisperClient,
    }),
  );

  return app;
};
