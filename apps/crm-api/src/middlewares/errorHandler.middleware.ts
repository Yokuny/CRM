import crypto from 'node:crypto';
import { badRespObj } from '@crm/contracts';
import type { NextFunction, Request, Response } from 'express';

// Erro tipado com status HTTP — usado por toda a cadeia de middlewares
// (validação, autenticação, autorização, rate limit) para sinalizar o código
// de resposta correto sem acoplar cada um deles a este arquivo.
export class CustomError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const hasStatus = (err: unknown): err is { status: number } =>
  typeof err === 'object' && err !== null && 'status' in err && typeof (err as { status: unknown }).status === 'number';

// Handler de erro global do Express: nunca expõe stack ou mensagem crua de um
// erro 500 no corpo da resposta — só no log estruturado, com requestId para
// correlação.
export const errorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
  const status = hasStatus(err) ? err.status : 500;
  const isKnownError = status < 500 && err instanceof Error;
  const message = isKnownError ? err.message : 'Erro interno do servidor';
  const requestId = (req.headers?.['x-request-id'] as string | undefined) ?? crypto.randomUUID();

  console.error(
    JSON.stringify({
      event: 'request.error',
      requestId,
      status,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    }),
  );

  res.status(status).json(badRespObj({ message }));
};
