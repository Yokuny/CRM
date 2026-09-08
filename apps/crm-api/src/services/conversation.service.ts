import type { SendMessage } from '@crm/contracts';
import type { ConversationMode } from '@crm/db';
import { CustomError } from '../middlewares/errorHandler.middleware.js';
import type {
  ConversationListItem,
  ConversationRecord,
  MessageRecord,
} from '../repositories/conversation.repository.js';
import * as conversationRepository from '../repositories/conversation.repository.js';
import { ConversationNotFoundError, OutsideWindowError } from '../repositories/conversation.repository.js';

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

// AD-010: takeover/release já são tenant-scoped ({_id,Tenant} na própria
// query, T37) — null aqui significa "não existe para esta sessão", mesmo
// idioma 404 de customer.service.ts (id ausente e id de outro tenant caem no
// mesmo erro, por design).
export const takeoverConversation = async (
  id: string,
  tenantId: string,
  userId: string,
): Promise<ConversationRecord> => {
  const result = await conversationRepository.takeover(id, tenantId, userId);
  if (!result) throw new CustomError('Conversation não encontrada', 404);
  return result;
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
