import type { FieldTemplateTargetType } from '@crm/contracts';
import { respObj } from '@crm/contracts';
import type { NextFunction, Request, Response } from 'express';
import { CustomError } from '../middlewares/errorHandler.middleware.js';
import type { FieldValueStores } from '../services/fieldTemplate.service.js';
import * as fieldTemplateService from '../services/fieldTemplate.service.js';

export type FieldTemplateControllerDeps = {
  fieldValueStores: FieldValueStores;
};

// O Tenant vem sempre de req.tenantUser (resolvido do banco pela sessão),
// nunca do corpo ou da query (AD-010). tenantAssignmentCheck já garantiu que
// ele existe antes de qualquer controller daqui rodar.
export const createFieldTemplateController = (deps: FieldTemplateControllerDeps) => {
  const createFieldTemplate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await fieldTemplateService.createFieldTemplate(req.tenantUser.tenant as string, req.body);
      res.status(201).json(respObj({ data: result }));
    } catch (e) {
      next(e);
    }
  };

  const getCurrentTemplate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await fieldTemplateService.getCurrentTemplate(
        req.tenantUser.tenant as string,
        req.query.targetType as FieldTemplateTargetType,
        req.query.key as string,
      );
      if (!result) throw new CustomError('Template não encontrado', 404);
      res.json(respObj({ data: result }));
    } catch (e) {
      next(e);
    }
  };

  const listTemplates = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const items = await fieldTemplateService.listTemplates(
        req.tenantUser.tenant as string,
        req.query.targetType as FieldTemplateTargetType,
      );
      res.json(respObj({ data: { items } }));
    } catch (e) {
      next(e);
    }
  };

  // WEB-08 (T25B): fetch de uma versão ESPECÍFICA (não necessariamente a
  // corrente) — 404 quando o par {template,version} não existe para este
  // Tenant (template ausente, de outro tenant, ou versão nunca reivindicada;
  // AD-010, indistinguível por design).
  const getTemplateVersion = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await fieldTemplateService.getTemplateVersion(
        req.tenantUser.tenant as string,
        req.params.id as string,
        req.params.version as unknown as number,
      );
      if (!result) throw new CustomError('Versão de template não encontrada', 404);
      res.json(respObj({ data: result }));
    } catch (e) {
      next(e);
    }
  };

  const bumpFieldTemplateVersion = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await fieldTemplateService.bumpFieldTemplateVersion(
        req.tenantUser.tenant as string,
        req.params.id as string,
        req.body,
        req.tenantUser.user,
        deps.fieldValueStores,
      );
      res.json(respObj({ data: result }));
    } catch (e) {
      next(e);
    }
  };

  const archiveFieldTemplate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await fieldTemplateService.archiveFieldTemplate(
        req.tenantUser.tenant as string,
        req.params.id as string,
      );
      res.json(respObj({ data: result }));
    } catch (e) {
      next(e);
    }
  };

  return {
    createFieldTemplate,
    getCurrentTemplate,
    listTemplates,
    getTemplateVersion,
    bumpFieldTemplateVersion,
    archiveFieldTemplate,
  };
};
