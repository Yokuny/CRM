import type { SendMessage } from '@crm/contracts';
import { badRespObj, respObj } from '@crm/contracts';
import type { NextFunction, Request, Response } from 'express';
import { CustomError } from '../middlewares/errorHandler.middleware.js';
import type { GetMessagesQuery, ListConversationsQuery } from '../services/conversation.service.js';
import * as conversationService from '../services/conversation.service.js';
import { ConversationAlreadyAssignedError } from '../services/conversation.service.js';

// INBOX-01/02/03: query já validada/coercida por validListConversationsQuery
// (router) — o Tenant vem sempre de req.tenantUser (AD-010).
export const listConversations = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await conversationService.listConversations(
      req.tenantUser.tenant as string,
      req.query as unknown as ListConversationsQuery,
    );
    res.json(respObj({ data: result }));
  } catch (e) {
    next(e);
  }
};

// INBOX-05/06: query já validada/coercida por validGetMessagesQuery (router)
// — o Tenant vem sempre de req.tenantUser (AD-010).
export const getMessages = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await conversationService.getMessages(
      req.params.id as string,
      req.tenantUser.tenant as string,
      req.query as unknown as GetMessagesQuery,
    );
    res.json(respObj({ data: result }));
  } catch (e) {
    next(e);
  }
};

// O Tenant vem sempre de req.tenantUser (AD-010), o assignee de takeover vem
// do usuário autenticado (req.tenantUser.user) — nunca do corpo ou da query,
// mesma convenção de customer.controller.ts. INBOX-08/09: só este controller
// traduz ConversationAlreadyAssignedError (T12/service) pra 409 — os demais
// erros tipados do domínio já chegam aqui como CustomError pronto.
export const takeoverConversation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await conversationService.takeoverConversation(
      req.params.id as string,
      req.tenantUser.tenant as string,
      req.tenantUser.user as string,
    );
    res.json(respObj({ data: result }));
  } catch (e) {
    if (e instanceof ConversationAlreadyAssignedError) {
      next(new CustomError(e.message, 409));
      return;
    }
    next(e);
  }
};

export const releaseConversation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await conversationService.releaseConversation(
      req.params.id as string,
      req.tenantUser.tenant as string,
    );
    res.json(respObj({ data: result }));
  } catch (e) {
    next(e);
  }
};

export const sendManualMessage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await conversationService.sendManualMessage(
      req.params.id as string,
      req.tenantUser.tenant as string,
      req.body as SendMessage,
    );
    res.status(201).json(respObj({ data: result }));
  } catch (e) {
    next(e);
  }
};

// INBOX-14/16: params já validados por resendMessageParamSchema (router) — o
// Tenant vem sempre de req.tenantUser (AD-010).
export const resendMessage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await conversationService.resendMessage(
      req.params.id as string,
      req.tenantUser.tenant as string,
      req.params.messageId as string,
    );
    res.status(201).json(respObj({ data: result }));
  } catch (e) {
    next(e);
  }
};

// INBOX-17/18: resposta É o binário — nunca respObj/res.json (design.md
// Tech Decisions, "response passthrough"). Erros conhecidos (CustomError, já
// traduzidos pelo service: 404/502) são respondidos AQUI, nunca via
// next(e)/errorHandler global — o errorHandler mascara toda mensagem de
// status >= 500 ("Erro interno do servidor"), o que apagaria a mensagem
// legível de MetaMediaUnavailableError exigida pelo spec.md (P2/AC3). Um
// erro desconhecido (bug real, não um CustomError) ainda segue para
// next(e)/errorHandler, mesmo caminho de qualquer outra rota.
export const getMessageMedia = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await conversationService.getMessageMedia(
      req.params.id as string,
      req.tenantUser.tenant as string,
      req.params.messageId as string,
    );
    res.set('Content-Type', result.mime ?? 'application/octet-stream');
    res.send(result.buffer);
  } catch (e) {
    if (e instanceof CustomError) {
      res.status(e.status).json(badRespObj({ message: e.message }));
      return;
    }
    next(e);
  }
};
