import crypto from 'node:crypto';
import type { Role, TenantUser } from '@crm/contracts';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.config.js';
import { CustomError } from './errorHandler.middleware.js';

declare global {
  namespace Express {
    interface Request {
      // Populado por createAuthMiddleware a partir do BANCO — nunca do
      // payload do token (FND-05).
      tenantUser: TenantUser;
    }
  }
}

export type SessionRecord = {
  user: string;
  deviceInfo: string;
};

export type UserRecord = {
  id: string;
  tenant?: string;
  role: Role[];
  isPlatformAdmin: boolean;
  active: boolean;
};

export type TenantRecord = {
  id: string;
  name: string;
  status: string;
};

// Injetado — os quatro pontos de contato com o banco que a fábrica precisa.
// Mantém o middleware testável sem HTTP e sem acoplar a um repositório
// concreto (a implementação real, sobre packages/db, é construída pelo
// consumidor).
export type AuthDeps = {
  findSessionByHash: (tokenHash: string) => Promise<SessionRecord | null>;
  revokeAllSessions: (userId: string) => Promise<void>;
  getUserById: (userId: string) => Promise<UserRecord | null>;
  getTenantById: (tenantId: string) => Promise<TenantRecord | null>;
};

// Função pura: cookie httpOnly `refreshToken` OU header `Authorization: Bearer`.
// A referência tinha `mobileUser?.length !== 2 && mobileUser?.[0] !== "Ease"`
// (só rejeita quando AMBAS as condições falham). Aqui as duas condições de
// malformação (tamanho errado OU scheme errado) são checadas juntas com um
// único `||`, então qualquer uma sozinha já rejeita.
export const extractToken = (req: Request): string | undefined => {
  const cookieToken = req.cookies?.refreshToken;
  if (cookieToken) return cookieToken;

  const authHeader = req.headers.authorization;
  if (!authHeader) return undefined;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return undefined;

  return parts[1];
};

export const createAuthMiddleware = (deps: AuthDeps) => {
  const validToken = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = extractToken(req);
      if (!token) throw new CustomError('Acesso inválido', 401);

      let userIdFromToken: string;
      try {
        const decoded = jwt.verify(token, env.SESSION_JWT_SECRET);
        if (typeof decoded === 'string' || !decoded.user) throw new Error('payload inválido');
        userIdFromToken = decoded.user as string;
      } catch {
        throw new CustomError('Acesso inválido ou expirado', 401);
      }

      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const session = await deps.findSessionByHash(tokenHash);
      if (!session) {
        console.error(JSON.stringify({ event: 'session.replay', userId: userIdFromToken }));
        throw new CustomError('Acesso inválido', 401);
      }

      const deviceInfo = req.headers['user-agent'] ?? 'unknown';
      if (session.deviceInfo !== deviceInfo) {
        await deps.revokeAllSessions(session.user);
        console.error(JSON.stringify({ event: 'session.device_mismatch', userId: session.user }));
        throw new CustomError('Acesso inválido', 401);
      }

      const user = await deps.getUserById(session.user);
      if (!user?.active) throw new CustomError('Acesso inválido', 401);

      const tenant = user.tenant ? await deps.getTenantById(user.tenant) : undefined;

      req.tenantUser = {
        tenant: tenant?.id,
        user: user.id,
        role: user.role,
        isPlatformAdmin: user.isPlatformAdmin,
      };

      next();
    } catch (e) {
      next(e);
    }
  };

  return { validToken };
};
