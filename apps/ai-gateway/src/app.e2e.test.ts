import { createHmac } from 'node:crypto';
import { connect, disconnect } from '@crm/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { env } from './config/env.config.js';

// AD-002: dois serviços sobre o mesmo Mongo — o ai-gateway também precisa
// responder /health desde a feature 1. MongoMemoryServer real (globalSetup do
// project e2e), mesmo padrão de apps/crm-api/src/routers/*.e2e.test.ts.
describe('GET /health', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
  });

  afterAll(async () => {
    await disconnect();
  });

  it('responds 200 with {success:true, data:{service:"ai-gateway", db:"up"}} with Mongo connected', async () => {
    const res = await request(buildApp()).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { service: 'ai-gateway', db: 'up' }, message: '' });
  });
});

// T32: prova que o router do webhook (T28) está de fato registrado em
// buildApp() — não só testável isolado (webhook.router.e2e.test.ts já cobre
// o comportamento exaustivo da rota; aqui só a montagem via env real importa).
describe('GET/POST /webhooks/whatsapp via buildApp()', () => {
  it('GET responds 200 with the raw hub.challenge using the real env.META_WEBHOOK_VERIFY_TOKEN', async () => {
    const res = await request(buildApp())
      .get('/webhooks/whatsapp')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': env.META_WEBHOOK_VERIFY_TOKEN, 'hub.challenge': 'ping' });

    expect(res.status).toBe(200);
    expect(res.text).toBe('ping');
  });

  it('POST responds 401 for a signature not matching env.META_APP_SECRET', async () => {
    const body = { entry: [] };
    const wrongSignature = `sha256=${createHmac('sha256', 'secret-errado').update(JSON.stringify(body)).digest('hex')}`;

    const res = await request(buildApp())
      .post('/webhooks/whatsapp')
      .set('X-Hub-Signature-256', wrongSignature)
      .send(body);

    expect(res.status).toBe(401);
  });
});

// T32: start() precisa conectar, escutar e subir os 3 workers de intervalo
// sem lançar — porta efêmera (0) e intervalos curtos evitam que o teste
// dependa dos defaults de produção (2s/30s/60s) ou abra uma porta fixa.
describe('start()', () => {
  it('connects to Mongo, starts listening, and starts the 3 interval workers without throwing', async () => {
    const { start } = await import('./server.js');

    const handle = await start({
      port: 0,
      outboxIntervalMs: 10,
      reaperIntervalMs: 10,
      reaperStaleAfterMs: 10,
      idleIntervalMs: 10,
      idleAfterMs: 10,
    });

    expect(handle).toBeDefined();
    expect(handle?.httpServer.listening).toBe(true);

    handle?.stopWorkers();
    await new Promise<void>((resolve, reject) => {
      handle?.httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  });
});
