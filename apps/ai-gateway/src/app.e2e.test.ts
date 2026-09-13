import crypto, { createHmac } from 'node:crypto';
import { AiSession, Conversation, connect, disconnect, Message } from '@crm/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { env } from './config/env.config.js';

const randomId = (): string => crypto.randomBytes(12).toString('hex');
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

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

// payments-asaas T23: prova que os dois webhook routers (Meta + Asaas)
// convivem em buildApp() sem colisão de rota — prefixos de path diferentes
// (/webhooks/whatsapp vs. /webhooks/asaas), cada um respondendo pelo seu
// próprio mecanismo de auth (HMAC-do-corpo vs. token+hash). Precisa de Mongo
// (a auth do Asaas resolve AsaasIntegration pelo webhookToken).
describe('POST /webhooks/asaas/:webhookToken via buildApp() (no collision with /webhooks/whatsapp)', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
  });

  afterAll(async () => {
    await disconnect();
  });

  it('responds 401 for an unknown webhookToken, independent of the Meta webhook mounted alongside it', async () => {
    const res = await request(buildApp())
      .post('/webhooks/asaas/token-desconhecido')
      .set('asaas-access-token', 'qualquer-coisa')
      .send({ event: 'PAYMENT_CONFIRMED' });

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

  // OPS-08 (wiring-level): flag desligada (default do env de teste, sem
  // RETENTION_PURGE_ENABLED definida — env.config.ts .default('false')) nunca
  // agenda o worker, mesmo com retentionIntervalMs/retentionMs curtos.
  it('with retentionPurgeEnabled left at its env default (false), never deletes a seeded expired Conversation even after waiting past a short interval', async () => {
    const { start } = await import('./server.js');

    const handle = await start({
      port: 0,
      outboxIntervalMs: 10,
      reaperIntervalMs: 10,
      reaperStaleAfterMs: 10,
      idleIntervalMs: 10,
      idleAfterMs: 10,
      retentionIntervalMs: 10,
      retentionMs: 10,
    });

    const conversation = await Conversation.create({
      Tenant: randomId(),
      Channel: randomId(),
      Customer: randomId(),
      createdAt: new Date(Date.now() - 1000),
    });

    await sleep(80);

    expect(await Conversation.findById(conversation._id).lean()).not.toBeNull();

    handle?.stopWorkers();
    await new Promise<void>((resolve, reject) => {
      handle?.httpServer.close((err) => (err ? reject(err) : resolve()));
    });
    await Conversation.deleteMany({ _id: conversation._id });
  });

  // OPS-09 (wiring-level): flag ligada via opts (mesmo padrão de
  // reaperIntervalMs) agenda o worker de fato — expira e faz cascata via
  // start()/stopWorkers(), não só via chamada direta da função pura (T5).
  it('with retentionPurgeEnabled:true deletes a seeded expired Conversation (and its Message/AiSession) after a short wait', async () => {
    const { start } = await import('./server.js');

    const handle = await start({
      port: 0,
      outboxIntervalMs: 10,
      reaperIntervalMs: 10,
      reaperStaleAfterMs: 10,
      idleIntervalMs: 10,
      idleAfterMs: 10,
      retentionPurgeEnabled: true,
      retentionIntervalMs: 10,
      retentionMs: 10,
    });

    const conversation = await Conversation.create({
      Tenant: randomId(),
      Channel: randomId(),
      Customer: randomId(),
      createdAt: new Date(Date.now() - 1000),
    });
    const message = await Message.create({
      Tenant: randomId(),
      Conversation: conversation._id,
      Channel: randomId(),
      Customer: randomId(),
      direction: 'in',
      type: 'text',
      text: 'olá',
    });
    const aiSession = await AiSession.create({ Tenant: randomId(), Conversation: conversation._id });

    await sleep(80);

    expect(await Conversation.findById(conversation._id).lean()).toBeNull();
    expect(await Message.findById(message._id).lean()).toBeNull();
    expect(await AiSession.findById(aiSession._id).lean()).toBeNull();

    handle?.stopWorkers();
    await new Promise<void>((resolve, reject) => {
      handle?.httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  });
});
