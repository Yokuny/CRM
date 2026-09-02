import type { NextFunction, Request, Response } from 'express';
import { CustomError } from './errorHandler.middleware.js';

// 424 exatamente quando req.tenantUser.tenant está ausente (FND-05/AC4) —
// orienta o usuário a concluir o vínculo, sem revelar detalhe interno.
export const tenantAssignmentCheck = (req: Request, _res: Response, next: NextFunction): void => {
  if (!req.tenantUser?.tenant) {
    next(new CustomError('Conclua o vínculo com uma empresa antes de continuar.', 424));
    return;
  }

  next();
};
