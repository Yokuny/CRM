import type { SignIn, TenantUser } from '@crm/contracts';
import { hashToken } from '@crm/db';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.config.js';
import { CustomError } from '../middlewares/errorHandler.middleware.js';
import * as authRepository from '../repositories/auth.repository.js';

const SESSION_TTL_MS = 4 * 24 * 60 * 60 * 1000;
const INVALID_CREDENTIALS_MESSAGE = 'E-mail ou senha inválidos.';

// Tudo que grava sessão é AWAITADO antes de devolver o token para o
// controller montar o cookie — corrige o `saveRefreshToken(...)` sem await
// da referência (Risk 5): sem isso, o cookie podia chegar ao cliente antes
// de a sessão existir no banco, e o primeiro /auth/session tomava 401.
export const signin = async (data: SignIn, deviceInfo: string): Promise<string> => {
  const user = await authRepository.findUserByEmail(data.email);
  if (!user?.active || !(await bcrypt.compare(data.password, user.password))) {
    throw new CustomError(INVALID_CREDENTIALS_MESSAGE, 401);
  }

  const sessionToken = jwt.sign({ user: user.id }, env.SESSION_JWT_SECRET, { expiresIn: '4d' });
  await authRepository.createSession({
    user: user.id,
    tenant: user.tenant,
    tokenHash: hashToken(sessionToken),
    deviceInfo,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });

  return sessionToken;
};

export type SessionView = {
  tenant?: { id: string; name: string; status: string };
  user: { id: string; name: string; email: string };
  role: TenantUser['role'];
};

// req.tenantUser já veio do banco (createAuthMiddleware — FND-05); aqui só
// enriquece com os campos de exibição (nome, e-mail, status) que o payload
// mínimo de TenantUser não carrega — outra leitura do banco, nunca do token.
export const getSessionView = async (tenantUser: TenantUser): Promise<SessionView> => {
  const user = await authRepository.findUserView(tenantUser.user);
  if (!user) throw new CustomError('Usuário não encontrado.', 401);

  const tenant = tenantUser.tenant ? await authRepository.findTenantView(tenantUser.tenant) : undefined;

  return { tenant: tenant ?? undefined, user, role: tenantUser.role };
};
