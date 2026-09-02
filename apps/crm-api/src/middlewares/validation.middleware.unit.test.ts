import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { validBody, validParams, validQuery } from './validation.middleware.js';

const testSchema = z
  .object({
    name: z.string().min(3, 'nome deve ter no mínimo 3 caracteres'),
    age: z.number().min(0, 'idade não pode ser negativa'),
  })
  .strict();

const buildReq = (target: 'body' | 'params' | 'query', value: unknown): Request =>
  ({ [target]: value }) as unknown as Request;

describe('validBody', () => {
  it('calls next exactly once with a single aggregated 400 error when 2 fields are invalid', () => {
    const req = buildReq('body', { name: 'a', age: -1 });
    const next = vi.fn() as unknown as NextFunction;

    validBody(testSchema)(req, {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = (next as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as Error & { status: number };
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(400);
    expect(err.message).toContain('name');
    expect(err.message).toContain('age');
  });

  it('calls next with no arguments when the body matches the schema', () => {
    const req = buildReq('body', { name: 'Fulano', age: 30 });
    const next = vi.fn() as unknown as NextFunction;

    validBody(testSchema)(req, {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect((next as unknown as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual([]);
  });
});

describe('validParams', () => {
  it('calls next with no arguments when params match the schema', () => {
    const req = buildReq('params', { name: 'Fulano', age: 30 });
    const next = vi.fn() as unknown as NextFunction;

    validParams(testSchema)(req, {} as Response, next);

    expect((next as unknown as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual([]);
  });
});

describe('validQuery', () => {
  it('calls next with no arguments when query matches the schema', () => {
    const req = buildReq('query', { name: 'Fulano', age: 30 });
    const next = vi.fn() as unknown as NextFunction;

    validQuery(testSchema)(req, {} as Response, next);

    expect((next as unknown as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual([]);
  });
});
