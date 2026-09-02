import type { Role } from '@crm/contracts';
import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { checkRole, isAdmin, isGestor, isOperador, platformAdminOnly } from './authorization.middleware.js';

const buildReq = (tenantUser: { role?: Role[]; isPlatformAdmin?: boolean }): Request =>
  ({ tenantUser }) as unknown as Request;

const asStatusError = (next: ReturnType<typeof vi.fn>): { status: number } =>
  next.mock.calls[0][0] as { status: number };

describe('checkRole — matriz papel×rota (FND-08)', () => {
  it.each([
    ['admin' as Role, ['admin'] as Role[], true],
    ['admin' as Role, ['gestor'] as Role[], false],
    ['gestor' as Role, ['gestor'] as Role[], true],
    ['gestor' as Role, ['operador'] as Role[], false],
    ['operador' as Role, ['operador'] as Role[], true],
    ['operador' as Role, ['admin'] as Role[], false],
  ])('allowedRoles=[%s], req.tenantUser.role=%s -> permitted=%s', (allowed, role, permitted) => {
    const next = vi.fn();

    checkRole([allowed])(buildReq({ role }), {} as Response, next as unknown as NextFunction);

    if (permitted) {
      expect(next).toHaveBeenCalledWith();
    } else {
      expect(asStatusError(next).status).toBe(403);
    }
  });
});

describe('role aliases', () => {
  it('isAdmin allows admin and rejects other roles with 403', () => {
    const nextOk = vi.fn();
    isAdmin(buildReq({ role: ['admin'] }), {} as Response, nextOk as unknown as NextFunction);
    expect(nextOk).toHaveBeenCalledWith();

    const nextReject = vi.fn();
    isAdmin(buildReq({ role: ['gestor'] }), {} as Response, nextReject as unknown as NextFunction);
    expect(asStatusError(nextReject).status).toBe(403);
  });

  it('isGestor allows gestor and rejects other roles with 403', () => {
    const nextOk = vi.fn();
    isGestor(buildReq({ role: ['gestor'] }), {} as Response, nextOk as unknown as NextFunction);
    expect(nextOk).toHaveBeenCalledWith();

    const nextReject = vi.fn();
    isGestor(buildReq({ role: ['operador'] }), {} as Response, nextReject as unknown as NextFunction);
    expect(asStatusError(nextReject).status).toBe(403);
  });

  it('isOperador allows operador and rejects other roles with 403', () => {
    const nextOk = vi.fn();
    isOperador(buildReq({ role: ['operador'] }), {} as Response, nextOk as unknown as NextFunction);
    expect(nextOk).toHaveBeenCalledWith();

    const nextReject = vi.fn();
    isOperador(buildReq({ role: ['admin'] }), {} as Response, nextReject as unknown as NextFunction);
    expect(asStatusError(nextReject).status).toBe(403);
  });
});

describe('platformAdminOnly (FND-01/AC3)', () => {
  it('calls next() when isPlatformAdmin is true', () => {
    const next = vi.fn();

    platformAdminOnly(buildReq({ isPlatformAdmin: true }), {} as Response, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledWith();
  });

  it('calls next(err) with 403 — never a bare next() — when isPlatformAdmin is false, which is what stops Express before reaching the controller', () => {
    const next = vi.fn();

    platformAdminOnly(buildReq({ isPlatformAdmin: false }), {} as Response, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    expect(asStatusError(next).status).toBe(403);
  });

  it('calls next(err) with 403 when isPlatformAdmin is absent from req.tenantUser', () => {
    const next = vi.fn();

    platformAdminOnly(buildReq({}), {} as Response, next as unknown as NextFunction);

    expect(asStatusError(next).status).toBe(403);
  });
});
