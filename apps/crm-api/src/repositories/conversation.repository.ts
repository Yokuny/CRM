import { Conversation, type ConversationDocument, type ConversationMode, Message, tenantScoped } from '@crm/db';
import { withDbTiming } from '../metrics/db.metric.js';

export type ConversationRecord = {
  id: string;
  tenant: string;
  channel: string;
  customer: string;
  mode: ConversationMode;
  assignee?: string;
  windowExpiresAt?: Date;
  lastActivityAt: Date;
};

const toRecord = (doc: ConversationDocument): ConversationRecord => ({
  id: doc._id.toString(),
  tenant: doc.Tenant.toString(),
  channel: doc.Channel.toString(),
  customer: doc.Customer.toString(),
  mode: doc.mode,
  assignee: doc.assignee?.toString(),
  windowExpiresAt: doc.windowExpiresAt,
  lastActivityAt: doc.lastActivityAt,
});

// Guarda de transição pela própria query ({_id,Tenant}) — mesmo padrão de
// transitionTenantStatus (tenant.model.ts): um id de outro tenant nunca casa,
// então nunca existe um `if` de checagem de Tenant fora da query (AD-010).
// `lastActivityAt` é atualizado junto: é "qualquer atividade... OU ação de
// operador" (design.md) — a base do idle sweep (T31/AIG-33) reinicia no
// momento do takeover, nunca no valor antigo de antes do operador assumir.
export const takeover = async (id: string, tenantId: string, userId: string): Promise<ConversationRecord | null> =>
  withDbTiming('conversation.takeover', async () => {
    const doc = await Conversation.findOneAndUpdate(
      tenantScoped({ _id: id, Tenant: tenantId }),
      { $set: { mode: 'human', assignee: userId, lastActivityAt: new Date() } },
      { returnDocument: 'after' },
    ).lean();
    return doc ? toRecord(doc) : null;
  });

export const release = async (id: string, tenantId: string): Promise<ConversationRecord | null> =>
  withDbTiming('conversation.release', async () => {
    const doc = await Conversation.findOneAndUpdate(
      tenantScoped({ _id: id, Tenant: tenantId }),
      { $set: { mode: 'bot', assignee: null, lastActivityAt: new Date() } },
      { returnDocument: 'after' },
    ).lean();
    return doc ? toRecord(doc) : null;
  });

// Erros tipados (não CustomError/HTTP-aware) — o service (T38) é quem
// traduz cada um para o código HTTP certo, o repository nunca decide isso.
export class ConversationNotFoundError extends Error {
  constructor() {
    super('Conversation não encontrada');
  }
}

export class OutsideWindowError extends Error {
  constructor() {
    super('Fora da janela de 24 horas — só um template aprovado pode ser enviado agora');
  }
}

export type OutboundMessagePayload =
  | { text: string }
  | { templateName: string; templateLanguage: string; templateParams: Record<string, string> };

export type MessageRecord = {
  id: string;
  status: string;
  text?: string;
  templateName?: string;
  templateLanguage?: string;
  templateParams?: Record<string, string>;
};

const isWithinWindow = (windowExpiresAt: Date | undefined): boolean =>
  !!windowExpiresAt && windowExpiresAt.getTime() > Date.now();

// AD-005: a janela de 24h é regra de negócio de primeira classe — texto
// livre fora da janela rejeita ANTES de qualquer insert (nunca uma Message
// 'queued' fantasma que o outbox consumer nunca poderia realmente enviar,
// AIG-37). Template é sempre aceito, dentro ou fora da janela (AIG-36).
export const createOutboundMessage = async (
  conversationId: string,
  tenantId: string,
  payload: OutboundMessagePayload,
): Promise<MessageRecord> =>
  withDbTiming('conversation.createOutboundMessage', async () => {
    const conversation = await Conversation.findOne(tenantScoped({ _id: conversationId, Tenant: tenantId })).lean();
    if (!conversation) throw new ConversationNotFoundError();

    const isFreeText = 'text' in payload;
    if (isFreeText && !isWithinWindow(conversation.windowExpiresAt)) throw new OutsideWindowError();

    const doc = await Message.create({
      Tenant: tenantId,
      Conversation: conversation._id,
      Channel: conversation.Channel,
      Customer: conversation.Customer,
      direction: 'out',
      type: 'text',
      status: 'queued',
      ...(isFreeText
        ? { text: payload.text }
        : {
            templateName: payload.templateName,
            templateLanguage: payload.templateLanguage,
            templateParams: payload.templateParams,
          }),
    });

    return {
      id: doc._id.toString(),
      status: doc.status as string,
      text: doc.text,
      templateName: doc.templateName,
      templateLanguage: doc.templateLanguage,
      templateParams: doc.templateParams,
    };
  });
