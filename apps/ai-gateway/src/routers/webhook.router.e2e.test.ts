import crypto, { createHmac } from 'node:crypto';
import type { AnthropicClient, AnthropicMessage } from '@crm/ai-kit';
import { Channel, connect, disconnect, FieldTemplate, Message } from '@crm/db';
import express, { type Express } from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createWebhookRouter, type WebhookRouterDeps } from './webhook.router.js';

const APP_SECRET = 'test-webhook-secret';
const VERIFY_TOKEN = 'test-verify-token-router';

const randomId = (): string => crypto.randomBytes(12).toString('hex');
const randomPhoneNumberId = (): string => `pn-${crypto.randomBytes(6).toString('hex')}`;
const randomFrom = (): string => `119${crypto.randomInt(10000000, 99999999)}`;

type FakeResponse = { content: Array<{ type: string; text?: string }>; stop_reason: string };

const createFakeClient = (text: string): AnthropicClient & { createMessage: ReturnType<typeof vi.fn> } => {
  const response: FakeResponse = { content: [{ type: 'text', text }], stop_reason: 'end_turn' };
  return { createMessage: vi.fn().mockResolvedValue(response as unknown as AnthropicMessage) };
};

const buildTestApp = (deps: WebhookRouterDeps): Express => {
  const app = express();
  app.use('/webhooks/whatsapp', createWebhookRouter(deps));
  return app;
};

const seedChannel = async (tenant: string, phoneNumberId: string) =>
  Channel.create({
    Tenant: tenant,
    phoneNumberId,
    accessTokenEnc: { ciphertext: 'c', iv: 'i', authTag: 'a' },
    status: 'active',
  });

const seedCustomerTemplate = async (tenant: string) =>
  FieldTemplate.create({ Tenant: tenant, targetType: 'customer', key: 'cliente', name: 'Cliente', currentVersion: 1 });

const metaTextPayload = (phoneNumberId: string, wamid: string, from: string, text: string) => ({
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'waba-1',
      changes: [
        {
          value: {
            messaging_product: 'whatsapp',
            metadata: { phone_number_id: phoneNumberId },
            messages: [{ id: wamid, from, type: 'text', text: { body: text } }],
          },
          field: 'messages',
        },
      ],
    },
  ],
});

const sign = (body: unknown, secret = APP_SECRET): string =>
  `sha256=${createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex')}`;

const postWebhook = (app: Express, body: unknown, signature: string | undefined) => {
  const req = request(app).post('/webhooks/whatsapp');
  if (signature !== undefined) req.set('X-Hub-Signature-256', signature);
  return req.send(body as object);
};

describe('webhook.router (AIG-05/06/07/08)', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
    await Channel.init();
    await Message.init();
  });

  afterEach(async () => {
    await Promise.all([Channel.deleteMany({}), Message.deleteMany({}), FieldTemplate.deleteMany({})]);
  });

  afterAll(async () => {
    await disconnect();
  });

  describe('GET /webhooks/whatsapp', () => {
    it('responds 200 with the raw hub.challenge (no JSON envelope) for the correct verify_token', async () => {
      const app = buildTestApp({ client: createFakeClient('oi'), verifyToken: VERIFY_TOKEN, appSecret: APP_SECRET });

      const res = await request(app)
        .get('/webhooks/whatsapp')
        .query({ 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY_TOKEN, 'hub.challenge': 'challenge-123' });

      expect(res.status).toBe(200);
      expect(res.text).toBe('challenge-123');
    });

    it('responds 403 for a wrong verify_token', async () => {
      const app = buildTestApp({ client: createFakeClient('oi'), verifyToken: VERIFY_TOKEN, appSecret: APP_SECRET });

      const res = await request(app)
        .get('/webhooks/whatsapp')
        .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'token-errado', 'hub.challenge': 'challenge-123' });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /webhooks/whatsapp', () => {
    it('responds 401 and persists nothing for an invalid signature', async () => {
      const tenant = randomId();
      const phoneNumberId = randomPhoneNumberId();
      await seedCustomerTemplate(tenant);
      await seedChannel(tenant, phoneNumberId);
      const app = buildTestApp({ client: createFakeClient('oi'), verifyToken: VERIFY_TOKEN, appSecret: APP_SECRET });
      const body = metaTextPayload(phoneNumberId, 'wamid.1', randomFrom(), 'oi');

      const res = await postWebhook(app, body, sign(body, 'secret-errado'));

      expect(res.status).toBe(401);
      expect(await Message.countDocuments({})).toBe(0);
    });

    it('responds 200 and persists nothing when phone_number_id has no matching Channel', async () => {
      const app = buildTestApp({ client: createFakeClient('oi'), verifyToken: VERIFY_TOKEN, appSecret: APP_SECRET });
      const body = metaTextPayload('sem-channel-nenhum', 'wamid.2', randomFrom(), 'oi');

      const res = await postWebhook(app, body, sign(body));

      expect(res.status).toBe(200);
      expect(await Message.countDocuments({})).toBe(0);
    });

    it('responds 200 and persists nothing for a malformed payload (missing wamid)', async () => {
      const tenant = randomId();
      const phoneNumberId = randomPhoneNumberId();
      await seedCustomerTemplate(tenant);
      await seedChannel(tenant, phoneNumberId);
      const app = buildTestApp({ client: createFakeClient('oi'), verifyToken: VERIFY_TOKEN, appSecret: APP_SECRET });
      const body = {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: phoneNumberId },
                  messages: [{ from: randomFrom(), type: 'text', text: { body: 'sem id' } }],
                },
              },
            ],
          },
        ],
      };

      const res = await postWebhook(app, body, sign(body));

      expect(res.status).toBe(200);
      expect(await Message.countDocuments({})).toBe(0);
    });

    it('responds 200, calls runTurn and persists a Message for a valid text message', async () => {
      const tenant = randomId();
      const phoneNumberId = randomPhoneNumberId();
      const from = randomFrom();
      await seedCustomerTemplate(tenant);
      await seedChannel(tenant, phoneNumberId);
      const client = createFakeClient('Olá! Como posso ajudar?');
      const app = buildTestApp({ client, verifyToken: VERIFY_TOKEN, appSecret: APP_SECRET });
      const body = metaTextPayload(phoneNumberId, 'wamid.3', from, 'oi, preciso de ajuda');

      const res = await postWebhook(app, body, sign(body));

      expect(res.status).toBe(200);
      expect(client.createMessage).toHaveBeenCalledTimes(1);
      const inMessage = await Message.findOne({ wamid: 'wamid.3', direction: 'in' }).lean();
      expect(inMessage?.text).toBe('oi, preciso de ajuda');
      const outMessage = await Message.findOne({ direction: 'out' }).lean();
      expect(outMessage?.text).toBe('Olá! Como posso ajudar?');
    });

    it('persists exactly 1 Message when the same wamid is delivered twice (Meta retry, AIG-07)', async () => {
      const tenant = randomId();
      const phoneNumberId = randomPhoneNumberId();
      const from = randomFrom();
      await seedCustomerTemplate(tenant);
      await seedChannel(tenant, phoneNumberId);
      const client = createFakeClient('resposta');
      const app = buildTestApp({ client, verifyToken: VERIFY_TOKEN, appSecret: APP_SECRET });
      const body = metaTextPayload(phoneNumberId, 'wamid.dup', from, 'oi de novo');

      const first = await postWebhook(app, body, sign(body));
      const second = await postWebhook(app, body, sign(body));

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(await Message.countDocuments({ wamid: 'wamid.dup' })).toBe(1);
    });
  });
});
