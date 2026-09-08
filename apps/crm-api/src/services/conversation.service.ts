import type { SendMessage } from '@crm/contracts';
import type { ConversationMode } from '@crm/db';
import { CustomError } from '../middlewares/errorHandler.middleware.js';
import { findUserView } from '../repositories/auth.repository.js';
import type {
  ConversationListItem,
  ConversationRecord,
  MessageListItem,
  MessageRecord,
} from '../repositories/conversation.repository.js';
import * as conversationRepository from '../repositories/conversation.repository.js';
import {
  ConversationNotFoundError,
  MessageNotFailedError,
  MessageNotFoundError,
  OutsideWindowError,
} from '../repositories/conversation.repository.js';

// Mesmo clamp de page/limit de customer.service.ts (CORE-12) — local a este
// arquivo (não importado do módulo irmão) porque page/limit já é um
// predicado pequeno e de arquivo único, mesmo precedente de isWithinWindow
// duplicado entre conversation.repository.ts e outboxConsumer.ts.
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const clampPage = (page: number | undefined): number => {
  if (page === undefined || !Number.isFinite(page) || page < 1) return 1;
  return Math.floor(page);
};

const clampLimit = (limit: number | undefined): number => {
  if (limit === undefined || !Number.isFinite(limit) || limit < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(limit), MAX_PAGE_SIZE);
};

export type ListConversationsQuery = {
  mode?: ConversationMode;
  assignee?: string;
  page?: number;
  limit?: number;
};

// INBOX-01/02/03: repassa filtro mode/assignee ao repository (T7) tal como
// veio da query — só page/limit são clampados aqui (mesma fronteira já
// estabelecida por customer.service.ts: query aceita qualquer número, o
// service decide o que fazer com valores fora dos limites).
export const listConversations = async (
  tenantId: string,
  query: ListConversationsQuery,
): Promise<{ items: ConversationListItem[]; total: number }> =>
  conversationRepository.listConversations(
    tenantId,
    { mode: query.mode, assignee: query.assignee },
    { page: clampPage(query.page), limit: clampLimit(query.limit) },
  );

export type GetMessagesQuery = { page?: number; limit?: number };

// INBOX-05/06: traduz o null do repository (T9) — conversa inexistente OU de
// outro tenant — pro mesmo idioma 404 já usado por takeover/release/
// sendManualMessage (AD-010: ambos os casos são indistinguíveis por design).
export const getMessages = async (
  id: string,
  tenantId: string,
  query: GetMessagesQuery,
): Promise<{ items: MessageListItem[]; total: number }> => {
  const result = await conversationRepository.getMessages(tenantId, id, {
    page: clampPage(query.page),
    limit: clampLimit(query.limit),
  });
  if (!result) throw new CustomError('Conversation não encontrada', 404);
  return result;
};

// INBOX-08/09: lançado quando o claim condicional (T11) falha porque a
// Conversation já está com um assignee DIFERENTE — nunca para "não existe"
// (esse caso é 404 direto, ver takeoverConversation). O controller traduz
// para 409 (design.md, Componente 4/Error Handling Strategy).
export class ConversationAlreadyAssignedError extends Error {
  constructor(assigneeName: string) {
    super(`Conversa já assumida por ${assigneeName}`);
  }
}

// AD-010: takeover/release já são tenant-scoped ({_id,Tenant} na própria
// query, T37) — null aqui significa "não existe para esta sessão" OU "já
// assumida por outro assignee" (T11, claim condicional); as duas causas
// precisam ser distinguidas aqui, refazendo uma leitura só quando o claim
// falhou. "Não existe" mantém o mesmo idioma 404 de customer.service.ts (id
// ausente e id de outro tenant caem no mesmo erro, por design); "já
// assumida" carrega o nome do assignee atual (context.md decisão #6).
export const takeoverConversation = async (
  id: string,
  tenantId: string,
  userId: string,
): Promise<ConversationRecord> => {
  const result = await conversationRepository.takeover(id, tenantId, userId);
  if (result) return result;

  const existing = await conversationRepository.findConversationById(id, tenantId);
  if (!existing) throw new CustomError('Conversation não encontrada', 404);

  const assigneeUser = existing.assignee ? await findUserView(existing.assignee) : null;
  throw new ConversationAlreadyAssignedError(assigneeUser?.name ?? 'outro operador');
};

export const releaseConversation = async (id: string, tenantId: string): Promise<ConversationRecord> => {
  const result = await conversationRepository.release(id, tenantId);
  if (!result) throw new CustomError('Conversation não encontrada', 404);
  return result;
};

// Traduz os erros tipados do repository (T37) para o código HTTP certo — o
// repository nunca decide isso sozinho.
export const sendManualMessage = async (id: string, tenantId: string, dto: SendMessage): Promise<MessageRecord> => {
  try {
    return await conversationRepository.createOutboundMessage(id, tenantId, dto);
  } catch (e) {
    if (e instanceof ConversationNotFoundError) throw new CustomError(e.message, 404);
    if (e instanceof OutsideWindowError) throw new CustomError(e.message, 400);
    throw e;
  }
};

// INBOX-14/16: traduz os erros tipados do repository (T13) — mensagem
// inexistente/de outro tenant é 404 (mesmo idioma dos demais 404 deste
// arquivo); status diferente de 'failed' é 400 (defesa em profundidade — a
// UI só mostra o botão de reenvio para mensagens failed, mas o backend
// valida de qualquer forma, design.md Error Handling Strategy).
export const resendMessage = async (id: string, tenantId: string, messageId: string): Promise<MessageRecord> => {
  try {
    return await conversationRepository.resendMessage(tenantId, id, messageId);
  } catch (e) {
    if (e instanceof MessageNotFoundError) throw new CustomError(e.message, 404);
    if (e instanceof MessageNotFailedError) throw new CustomError(e.message, 400);
    throw e;
  }
};
