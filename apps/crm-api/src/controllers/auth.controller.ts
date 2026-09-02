import { respObj } from '@crm/contracts';
import type { NextFunction, Request, Response } from 'express';
import { cookieOptions } from '../config/cookie.config.js';
import * as authService from '../services/auth.service.js';

export const signin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const deviceInfo = (req.headers['user-agent'] as string | undefined) ?? 'unknown';
    const sessionToken = await authService.signin(req.body, deviceInfo);
    res.cookie('refreshToken', sessionToken, cookieOptions);
    res.json(respObj({ message: 'Login realizado com sucesso.' }));
  } catch (e) {
    next(e);
  }
};

export const session = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await authService.getSessionView(req.tenantUser);
    res.json(respObj({ data }));
  } catch (e) {
    next(e);
  }
};
