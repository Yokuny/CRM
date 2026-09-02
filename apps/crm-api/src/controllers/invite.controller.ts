import { respObj } from '@crm/contracts';
import type { NextFunction, Request, Response } from 'express';
import { cookieOptions } from '../config/cookie.config.js';
import * as inviteService from '../services/invite.service.js';

export const peekInvite = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await inviteService.peekInvite(req.params.token as string);
    res.json(respObj({ data: result }));
  } catch (e) {
    next(e);
  }
};

export const acceptInvite = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const deviceInfo = (req.headers['user-agent'] as string | undefined) ?? 'unknown';
    const { sessionToken } = await inviteService.acceptInvite(req.params.token as string, req.body, deviceInfo);
    res.cookie('refreshToken', sessionToken, cookieOptions);
    res.status(201).json(respObj({ message: 'Conta criada com sucesso.' }));
  } catch (e) {
    next(e);
  }
};
