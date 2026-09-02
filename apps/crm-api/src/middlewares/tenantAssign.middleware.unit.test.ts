import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { tenantAssignmentCheck } from './tenantAssign.middleware.js';

const buildReq = (tenant?: string): Request => ({ tenantUser: { tenant } }) as unknown as Request;

describe('tenantAssignmentCheck (FND-05/AC4)', () => {
  it('calls next() when req.tenantUser.tenant is present', () => {
    const next = vi.fn();

    tenantAssignmentCheck(buildReq('tenant-1'), {} as Response, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledWith();
  });

  it('responds 424 exactly when req.tenantUser.tenant is absent', () => {
    const next = vi.fn();

    tenantAssignmentCheck(buildReq(undefined), {} as Response, next as unknown as NextFunction);

    const err = next.mock.calls[0][0] as { status: number; message: string };
    expect(err.status).toBe(424);
    expect(err.message.length).toBeGreaterThan(0);
  });
});
