import { createHmac } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import {
  createWebhookSignatureMiddleware,
  type RawBodyRequest,
  verifyWebhookSignature,
} from './webhookSignature.middleware.js';

// Prova de que a comparação usa `crypto.timingSafeEqual` (não `===` de
// string, AIG-06/Done-when) — node:crypto é um módulo nativo ESM, cujo
// namespace não é "configurable" (vi.spyOn direto lança "Module namespace is
// not configurable in ESM"). vi.mock com importOriginal (hoisted pelo Vitest
// acima de todo import, inclusive os estáticos acima) envolve só
// `timingSafeEqual` num spy que ainda delega para a implementação real,
// preservando o comportamento correto dos demais testes (retorna true/false
// de verdade) enquanto prova QUE a função nativa foi chamada.
const timingSafeEqualSpy = vi.fn();
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return {
    ...actual,
    timingSafeEqual: (...args: Parameters<typeof actual.timingSafeEqual>) => {
      timingSafeEqualSpy(...args);
      return actual.timingSafeEqual(...args);
    },
  };
});

const APP_SECRET = 'meta-app-secret';
const BODY = Buffer.from('{"entry":[]}');
const validSignature = (secret: string, body: Buffer): string =>
  `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

const buildReq = (rawBody: Buffer, signature: string | undefined): RawBodyRequest =>
  ({ rawBody, header: (_name: string) => signature }) as unknown as RawBodyRequest;

const buildRes = () => {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
};

describe('verifyWebhookSignature (AIG-06)', () => {
  it('returns true for a signature calculated with the same secret over the same raw body', () => {
    expect(verifyWebhookSignature(BODY, validSignature(APP_SECRET, BODY), APP_SECRET)).toBe(true);
  });

  it('returns false when the signature header is absent', () => {
    expect(verifyWebhookSignature(BODY, undefined, APP_SECRET)).toBe(false);
  });

  it('returns false when the signature was calculated with the wrong secret', () => {
    expect(verifyWebhookSignature(BODY, validSignature('secret-errado', BODY), APP_SECRET)).toBe(false);
  });

  it('uses crypto.timingSafeEqual for the comparison, not string ===', () => {
    timingSafeEqualSpy.mockClear();

    verifyWebhookSignature(BODY, validSignature(APP_SECRET, BODY), APP_SECRET);

    expect(timingSafeEqualSpy).toHaveBeenCalledTimes(1);
  });
});

describe('createWebhookSignatureMiddleware', () => {
  it('calls next() when the signature is valid', () => {
    const middleware = createWebhookSignatureMiddleware(APP_SECRET);
    const next = vi.fn();

    middleware(buildReq(BODY, validSignature(APP_SECRET, BODY)), buildRes(), next as unknown as NextFunction);

    expect(next).toHaveBeenCalledWith();
  });

  it('responds 401 without calling next() when the signature header is missing', () => {
    const middleware = createWebhookSignatureMiddleware(APP_SECRET);
    const res = buildRes();
    const next = vi.fn();

    middleware(buildReq(BODY, undefined), res, next as unknown as NextFunction);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Assinatura do webhook inválida' });
    expect(next).not.toHaveBeenCalled();
  });

  it('responds 401 without calling next() when the signature was calculated with the wrong secret', () => {
    const middleware = createWebhookSignatureMiddleware(APP_SECRET);
    const res = buildRes();
    const next = vi.fn();

    middleware(buildReq(BODY, validSignature('secret-errado', BODY)), res, next as unknown as NextFunction);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
