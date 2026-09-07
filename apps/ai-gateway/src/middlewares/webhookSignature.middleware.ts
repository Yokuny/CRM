import { createHmac, timingSafeEqual } from 'node:crypto';
import { badRespObj } from '@crm/contracts';
import type { NextFunction, Request, Response } from 'express';

// express.json({verify}) (webhook.router.ts, T28) grava o corpo cru aqui
// ANTES do parse — o HMAC precisa dos bytes exatos recebidos, nunca do corpo
// já reserializado a partir do objeto parseado.
export type RawBodyRequest = Request & { rawBody?: Buffer };

// AIG-06 / design.md Tech Decisions: HMAC-SHA256 do corpo cru vs
// META_APP_SECRET, comparação em tempo constante — como a API da Meta
// funciona, não é escolha de produto (fato técnico, confirmado por busca
// externa no Design).
export const verifyWebhookSignature = (
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean => {
  if (!signatureHeader) return false;

  const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signatureHeader);
  // timingSafeEqual lança se os buffers tiverem tamanhos diferentes — trata
  // como assinatura inválida sem chamar (a diferença de tamanho já denuncia
  // a assinatura errada, nenhum dado sensível vaza nessa checagem curta).
  if (expectedBuf.length !== actualBuf.length) return false;

  return timingSafeEqual(expectedBuf, actualBuf);
};

// 401 sem tocar nenhum dado (AIG-06) — middleware isolado, testável como
// função pura via req/res mockados (mesmo padrão de authorization.middleware.ts).
export const createWebhookSignatureMiddleware = (appSecret: string) => {
  return (req: RawBodyRequest, res: Response, next: NextFunction): void => {
    const signature = req.header('X-Hub-Signature-256');
    const rawBody = req.rawBody ?? Buffer.alloc(0);

    if (!verifyWebhookSignature(rawBody, signature, appSecret)) {
      res.status(401).json(badRespObj({ message: 'Assinatura do webhook inválida' }));
      return;
    }

    next();
  };
};
