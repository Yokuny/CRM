import crypto from 'node:crypto';
import { connect, disconnect, Session, Tenant, User } from '@crm/db';
import cookieParser from 'cookie-parser';
import type { Request } from 'express';
import express from 'express';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { env } from '../config/env.config.js';
import type { AuthDeps } from './authentication.middleware.js';
import { createAuthMiddleware, extractToken } from './authentication.middleware.js';
import { errorHandler } from './errorHandler.middleware.js';

describe('extractToken', () => {
  const buildReq = (overrides: { cookies?: Record<string, string>; headers?: Record<string, string> }): Request =>
    ({ cookies: overrides.cookies ?? {}, headers: overrides.headers ?? {} }) as unknown as Request;

  it('returns undefined when neither a cookie nor an Authorization header is present (ausente)', () => {
    expect(extractToken(buildReq({}))).toBeUndefined();
  });

  it('returns undefined for a wrong auth scheme (scheme errado)', () => {
    expect(extractToken(buildReq({ headers: { authorization: 'Basic abc123' } }))).toBeUndefined();
  });

  it('returns undefined when the header has the wrong number of parts (partes erradas)', () => {
    expect(extractToken(buildReq({ headers: { authorization: 'Bearer' } }))).toBeUndefined();
    expect(extractToken(buildReq({ headers: { authorization: 'Bearer a b' } }))).toBeUndefined();
  });

  it('returns the token from a well-formed Bearer header (válido)', () => {
    expect(extractToken(buildReq({ headers: { authorization: 'Bearer abc.def.ghi' } }))).toBe('abc.def.ghi');
  });

  it('prefers the cookie when present, and falls back to a valid header when the cookie is absent (caso do spec)', () => {
    expect(
      extractToken(
        buildReq({ cookies: { refreshToken: 'from-cookie' }, headers: { authorization: 'Bearer from-header' } }),
      ),
    ).toBe('from-cookie');
    expect(extractToken(buildReq({ cookies: {}, headers: { authorization: 'Bearer from-header' } }))).toBe(
      'from-header',
    );
  });
});

describe('createAuthMiddleware', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
  });

  afterEach(async () => {
    await Promise.all([Session.deleteMany({}), User.deleteMany({}), Tenant.deleteMany({})]);
  });

  afterAll(async () => {
    await disconnect();
  });

  const buildDeps = (): AuthDeps => ({
    findSessionByHash: async (tokenHash) => {
      const session = await Session.findOne({ tokenHash }).lean();
      return session ? { user: session.user.toString(), deviceInfo: session.deviceInfo } : null;
    },
    revokeAllSessions: async (userId) => {
      await Session.deleteMany({ user: userId });
    },
    getUserById: async (userId) => {
      const user = await User.findById(userId).lean();
      return user
        ? {
            id: user._id.toString(),
            tenant: user.Tenant?.toString(),
            role: user.role,
            isPlatformAdmin: user.isPlatformAdmin,
            active: user.active,
          }
        : null;
    },
    getTenantById: async (tenantId) => {
      const tenant = await Tenant.findById(tenantId).lean();
      return tenant ? { id: tenant._id.toString(), name: tenant.name, status: tenant.status } : null;
    },
  });

  const buildTestApp = () => {
    const app = express();
    app.use(cookieParser());
    const { validToken } = createAuthMiddleware(buildDeps());
    app.get('/private', validToken, (req, res) => {
      res.json({ tenantUser: req.tenantUser });
    });
    app.use(errorHandler);
    return app;
  };

  const issueSession = async (params: {
    userId: string;
    deviceInfo: string;
    payloadOverride?: Record<string, unknown>;
  }) => {
    // jti aleatório: sem isso, duas chamadas no mesmo segundo (mesmo `iat`)
    // gerariam o MESMO JWT — e o mesmo tokenHash, que é unique no Session.
    const rawToken = jwt.sign(
      { user: params.userId, jti: crypto.randomUUID(), ...params.payloadOverride },
      env.SESSION_JWT_SECRET,
    );
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await Session.create({
      user: params.userId,
      tokenHash,
      deviceInfo: params.deviceInfo,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    return rawToken;
  };

  it('populates req.tenantUser from the database, ignoring role/tenant forged into the token payload (FND-05)', async () => {
    const tenant = await Tenant.create({ name: 'Empresa B', document: '22222222000102', status: 'active' });
    const user = await User.create({
      name: 'Beatriz',
      email: 'beatriz@example.com',
      password: 'hash',
      Tenant: tenant._id,
      role: ['operador'],
    });
    const rawToken = jwt.sign({ user: user.id, role: ['admin'], tenant: 'forged-tenant-id' }, env.SESSION_JWT_SECRET);
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await Session.create({
      user: user.id,
      tokenHash,
      deviceInfo: 'agent-1',
      expiresAt: new Date(Date.now() + 3600_000),
    });

    const res = await request(buildTestApp())
      .get('/private')
      .set('Cookie', `refreshToken=${rawToken}`)
      .set('User-Agent', 'agent-1');

    expect(res.status).toBe(200);
    expect(res.body.tenantUser).toEqual({
      tenant: tenant.id,
      user: user.id,
      role: ['operador'],
      isPlatformAdmin: false,
    });
  });

  it('revokes every session of the user and logs only {event, userId} on session.device_mismatch — never the raw device or token (FND-06/AC2)', async () => {
    const tenant = await Tenant.create({ name: 'Empresa A', document: '11111111000101', status: 'active' });
    const user = await User.create({
      name: 'Ana',
      email: 'ana@example.com',
      password: 'hash',
      Tenant: tenant._id,
      role: ['gestor'],
    });
    const tokenA = await issueSession({ userId: user.id, deviceInfo: 'agent-original' });
    await issueSession({ userId: user.id, deviceInfo: 'agent-other' });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await request(buildTestApp())
      .get('/private')
      .set('Cookie', `refreshToken=${tokenA}`)
      .set('User-Agent', 'agent-attacker');

    expect(res.status).toBe(401);
    expect(await Session.countDocuments({ user: user.id })).toBe(0);
    expect(logSpy).not.toHaveBeenCalled();

    const call = errorSpy.mock.calls.find((args) => (args[0] as string).includes('session.device_mismatch'));
    expect(call).toBeDefined();
    const logged = JSON.parse(call?.[0] as string);
    expect(logged).toEqual({ event: 'session.device_mismatch', userId: user.id });

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('responds 401 and logs only {event, userId} on session.replay when the JWT is valid but no session exists', async () => {
    const tenant = await Tenant.create({ name: 'Empresa C', document: '33333333000103', status: 'active' });
    const user = await User.create({
      name: 'Carlos',
      email: 'carlos@example.com',
      password: 'hash',
      Tenant: tenant._id,
      role: ['admin'],
    });
    const rawToken = jwt.sign({ user: user.id }, env.SESSION_JWT_SECRET);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await request(buildTestApp())
      .get('/private')
      .set('Cookie', `refreshToken=${rawToken}`)
      .set('User-Agent', 'agent-1');

    expect(res.status).toBe(401);
    const logged = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logged).toEqual({ event: 'session.replay', userId: user.id });

    errorSpy.mockRestore();
  });

  it('applies the same device check via the Authorization header when the cookie is absent (spec edge case)', async () => {
    const tenant = await Tenant.create({ name: 'Empresa D', document: '44444444000104', status: 'active' });
    const user = await User.create({
      name: 'Duda',
      email: 'duda@example.com',
      password: 'hash',
      Tenant: tenant._id,
      role: ['gestor'],
    });
    const rawToken = await issueSession({ userId: user.id, deviceInfo: 'agent-real' });

    const mismatched = await request(buildTestApp())
      .get('/private')
      .set('Authorization', `Bearer ${rawToken}`)
      .set('User-Agent', 'agent-different');
    expect(mismatched.status).toBe(401);
    expect(await Session.countDocuments({ user: user.id })).toBe(0);

    const rawTokenAgain = await issueSession({ userId: user.id, deviceInfo: 'agent-real' });
    const matched = await request(buildTestApp())
      .get('/private')
      .set('Authorization', `Bearer ${rawTokenAgain}`)
      .set('User-Agent', 'agent-real');
    expect(matched.status).toBe(200);
    expect(matched.body.tenantUser.user).toBe(user.id);
  });
});
