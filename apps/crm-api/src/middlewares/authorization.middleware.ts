import type { Role } from '@crm/contracts';
import type { NextFunction, Request, Response } from 'express';
import { CustomError } from './errorHandler.middleware.js';

// checkRole é síncrono e só lê req.tenantUser (já resolvido do banco por
// createAuthMiddleware) — nunca toca dados antes de decidir (FND-08).
export const checkRole = (allowedRoles: Role[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const userRoles = req.tenantUser?.role ?? [];
    const hasPermission = userRoles.some((role) => allowedRoles.includes(role));

    if (!hasPermission) {
      next(new CustomError('Você não tem permissão para realizar esta ação', 403));
      return;
    }

    next();
  };
};

export const isAdmin = checkRole(['admin']);
export const isGestor = checkRole(['gestor']);
export const isOperador = checkRole(['operador']);

// 403 antes de QUALQUER acesso a dados/controller (FND-01/AC3) — chamar
// next(err) aqui é o que impede o Express de seguir para a rota; só a flag
// isPlatformAdmin já resolvida por createAuthMiddleware decide, nunca o body.
export const platformAdminOnly = (req: Request, _res: Response, next: NextFunction): void => {
  if (!req.tenantUser?.isPlatformAdmin) {
    next(new CustomError('Acesso restrito a administradores da plataforma', 403));
    return;
  }

  next();
};
