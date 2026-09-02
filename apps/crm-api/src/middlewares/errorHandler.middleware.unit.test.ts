import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { CustomError, errorHandler } from './errorHandler.middleware.js';

const buildRes = () => {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
};

const buildReq = (): Request => ({ headers: {} }) as unknown as Request;

describe('errorHandler', () => {
  it('responds 500 with badRespObj and never leaks the stack in the response body for an unexpected error', () => {
    const res = buildRes();

    errorHandler(new Error('boom'), buildReq(), res, vi.fn() as unknown as NextFunction);

    expect(res.status).toHaveBeenCalledWith(500);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body).toEqual({ success: false, message: 'Erro interno do servidor' });
    expect(body).not.toHaveProperty('stack');
  });

  it('responds with the CustomError status and its own message for a known error', () => {
    const res = buildRes();

    errorHandler(new CustomError('campo inválido', 400), buildReq(), res, vi.fn() as unknown as NextFunction);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'campo inválido' });
  });

  it('logs a structured event carrying a requestId for the error, without the response body', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = buildRes();

    errorHandler(new Error('boom'), buildReq(), res, vi.fn() as unknown as NextFunction);

    expect(spy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(spy.mock.calls[0][0] as string);
    expect(logged.event).toBe('request.error');
    expect(typeof logged.requestId).toBe('string');
    expect(logged.requestId.length).toBeGreaterThan(0);
    expect(typeof logged.stack).toBe('string');

    spy.mockRestore();
  });
});
