import crypto from 'node:crypto';
import { type ApiMessageKey, badRespObj, isApiMessageKey } from '@crm/contracts';
import type { NextFunction, Request, Response } from 'express';

// Base de todo erro que chega ao cliente: `message` é SEMPRE uma chave de
// tradução do contrato (`@crm/contracts`, response/messages.ts), nunca texto
// pronto — quem traduz é o front-end. O texto técnico (campo inválido, id,
// nome do operador) vai em `detail`, que só aparece no log estruturado.
export class KeyedError extends Error {
  declare message: ApiMessageKey;
  readonly detail?: string;

  constructor(message: ApiMessageKey, detail?: string) {
    super(message);
    this.detail = detail;
  }
}

// Erro tipado com status HTTP — usado por toda a cadeia de middlewares
// (validação, autenticação, autorização, rate limit) para sinalizar o código
// de resposta correto sem acoplar cada um deles a este arquivo.
export class CustomError extends KeyedError {
  status: number;

  constructor(message: ApiMessageKey, status: number, detail?: string) {
    super(message, detail);
    this.status = status;
  }
}

const hasStatus = (err: unknown): err is { status: number } =>
  typeof err === 'object' && err !== null && 'status' in err && typeof (err as { status: unknown }).status === 'number';

// Handler de erro global do Express: nunca expõe stack nem texto cru no corpo
// da resposta — só no log estruturado, com requestId para correlação. O corpo
// sempre carrega uma chave do contrato: a do próprio erro quando ele já é uma
// (CustomError/KeyedError), `invalid_data` para um 4xx de terceiros sem chave
// (ex.: JSON malformado do express.json) e `internal_error` para qualquer 5xx.
const resolveMessageKey = (err: unknown, status: number): ApiMessageKey => {
  if (status >= 500) return 'internal_error';
  if (err instanceof Error && isApiMessageKey(err.message)) return err.message;
  return 'invalid_data';
};

export const errorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
  const status = hasStatus(err) ? err.status : 500;
  const message = resolveMessageKey(err, status);
  const requestId = (req.headers?.['x-request-id'] as string | undefined) ?? crypto.randomUUID();

  console.error(
    JSON.stringify({
      event: 'request.error',
      requestId,
      status,
      message: err instanceof Error ? err.message : String(err),
      detail: err instanceof KeyedError ? err.detail : undefined,
      stack: err instanceof Error ? err.stack : undefined,
    }),
  );

  res.status(status).json(badRespObj({ message }));
};
