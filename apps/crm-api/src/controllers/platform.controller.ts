import { respObj } from '@crm/contracts';
import type { NextFunction, Request, Response } from 'express';
import type { MailProvider } from '../providers/mail/index.js';
import * as platformService from '../services/platform.service.js';

export type PlatformControllerDeps = {
  mailProvider: MailProvider;
  inviteBaseUrl: string;
};

export const createPlatformController = (deps: PlatformControllerDeps) => {
  const provisionTenant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await platformService.provisionTenant(req.body);
      res.status(201).json(respObj({ data: result }));
    } catch (e) {
      next(e);
    }
  };

  // 202 quando o envio falha, mas o convite já está persistido (FND-12) —
  // nunca 500, o e-mail não é o que garante a criação do recurso.
  const inviteToTenant = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await platformService.inviteToTenant(
        req.params.id as string,
        req.body,
        req.tenantUser.user,
        deps.mailProvider,
        deps.inviteBaseUrl,
      );
      const status = result.sent ? 201 : 202;
      res.status(status).json(
        respObj({
          data: { id: result.id },
          message: result.sent ? undefined : 'Convite criado, mas o envio do e-mail falhou',
        }),
      );
    } catch (e) {
      next(e);
    }
  };

  return { provisionTenant, inviteToTenant };
};
