import { createHash } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type AsaasWebhookRequest, createAsaasWebhookAuthMiddleware } from './asaasWebhookAuth.middleware.js';

// Mesmo idioma de issuePaymentLink.unit.test.ts: mock completo de @crm/db
// (não MongoMemoryServer — este é o project "unit", sem globalSetup de
// Mongo) — `sha256` reimplementado aqui via node:crypto real (mesmo
// algoritmo de crypto.helper.ts) para os hashes ficarem verificáveis sem
// depender da implementação de produção.
const integrationFindOneMock = vi.fn();

vi.mock('@crm/db', () => ({
  AsaasIntegration: { findOne: (...args: unknown[]) => integrationFindOneMock(...args) },
  sha256: (value: string) => createHash('sha256').update(value).digest('hex'),
}));

const lean = <T>(value: T) => ({ lean: () => Promise.resolve(value) });

const buildReq = (webhookToken: string, header: string | undefined): AsaasWebhookRequest =>
  ({ params: { webhookToken }, header: (_name: string) => header }) as unknown as AsaasWebhookRequest;

const buildRes = () => {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
};

const AUTH_TOKEN = 'tenant-auth-token';
const AUTH_HASH = createHash('sha256').update(AUTH_TOKEN).digest('hex');
const WEBHOOK_TOKEN = 'webhook-token-abc';

describe('createAsaasWebhookAuthMiddleware (PAY-06)', () => {
  beforeEach(() => {
    integrationFindOneMock.mockReset();
  });

  it('responds 401 without calling next() for an unknown webhookToken, touching no data', async () => {
    integrationFindOneMock.mockReturnValue(lean(null));
    const middleware = createAsaasWebhookAuthMiddleware();
    const req = buildReq('token-desconhecido', AUTH_TOKEN);
    const res = buildRes();
    const next = vi.fn();

    await middleware(req, res, next as unknown as NextFunction);

    expect(integrationFindOneMock).toHaveBeenCalledWith({ webhookToken: 'token-desconhecido' });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('responds 401 without calling next() when the asaas-access-token header is missing', async () => {
    integrationFindOneMock.mockReturnValue(lean({ webhookAuthTokenHash: AUTH_HASH }));
    const middleware = createAsaasWebhookAuthMiddleware();
    const req = buildReq(WEBHOOK_TOKEN, undefined);
    const res = buildRes();
    const next = vi.fn();

    await middleware(req, res, next as unknown as NextFunction);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('responds 401 without calling next() when the header hash does not match the stored hash', async () => {
    integrationFindOneMock.mockReturnValue(lean({ webhookAuthTokenHash: AUTH_HASH }));
    const middleware = createAsaasWebhookAuthMiddleware();
    const req = buildReq(WEBHOOK_TOKEN, 'token-errado');
    const res = buildRes();
    const next = vi.fn();

    await middleware(req, res, next as unknown as NextFunction);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() and attaches the resolved integration to req when the header hash matches (no 401 call)', async () => {
    const integration = { webhookAuthTokenHash: AUTH_HASH, Tenant: 'tenant-1' };
    integrationFindOneMock.mockReturnValue(lean(integration));
    const middleware = createAsaasWebhookAuthMiddleware();
    const req = buildReq(WEBHOOK_TOKEN, AUTH_TOKEN);
    const res = buildRes();
    const next = vi.fn();

    await middleware(req, res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
    expect((req as unknown as { asaasIntegration?: unknown }).asaasIntegration).toBe(integration);
  });
});
