import type { SendMessage } from '@crm/contracts';
import { CustomError } from '../middlewares/errorHandler.middleware.js';
import type { ConversationRecord, MessageRecord } from '../repositories/conversation.repository.js';
import * as conversationRepository from '../repositories/conversation.repository.js';
import { ConversationNotFoundError, OutsideWindowError } from '../repositories/conversation.repository.js';

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
