import {
  Conversation,
  type ConversationDocument,
  type ConversationMode,
  Message,
  type MessageDocument,
  tenantScoped,
} from '@crm/db';
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

// INBOX-08: claim condicional (context.md decisão #6) — mesmo padrão de
// findOneAndUpdate atômico de claimTurnLock/claimQueuedMessage. A query só
// societa quando a Conversation está livre (mode:'bot') OU já pertence ao
// MESMO userId (idempotente — reclicar "assumir" sendo o mesmo operador não
// é erro). Guarda de transição pela própria query ({_id,Tenant}) — mesmo
// padrão de transitionTenantStatus (tenant.model.ts): um id de outro tenant
// nunca casa (AD-010). `null` cobre DOIS casos que quem chama (o service)
// precisa distinguir: a Conversation não existe para este Tenant, OU existe
// mas está com um assignee DIFERENTE — nunca sobrescreve nesse segundo caso.
// `lastActivityAt` é atualizado junto: é "qualquer atividade... OU ação de
// operador" (design.md) — a base do idle sweep (T31/AIG-33) reinicia no
// momento do takeover, nunca no valor antigo de antes do operador assumir.
export const takeover = async (id: string, tenantId: string, userId: string): Promise<ConversationRecord | null> =>
  withDbTiming('conversation.takeover', async () => {
    const doc = await Conversation.findOneAndUpdate(
      tenantScoped({ _id: id, Tenant: tenantId, $or: [{ mode: 'bot' as const }, { assignee: userId }] }),
      { $set: { mode: 'human', assignee: userId, lastActivityAt: new Date() } },
      { returnDocument: 'after' },
    ).lean();
    return doc ? toRecord(doc) : null;
  });

// Leitura simples, tenant-scoped, usada pelo service (T12) SÓ quando o claim
// condicional acima falha (retornou null) — para distinguir "não existe" de
// "existe mas está com outro assignee" sem uma segunda escrita.
export const findConversationById = async (id: string, tenantId: string): Promise<ConversationRecord | null> =>
  withDbTiming('conversation.findConversationById', async () => {
    const doc = await Conversation.findOne(tenantScoped({ _id: id, Tenant: tenantId })).lean();
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

export type ConversationListItem = {
  id: string;
  customer: string;
  mode: ConversationMode;
  assignee?: string;
  lastActivityAt: Date;
  unread: boolean;
  windowOpen: boolean;
  windowExpiresAt?: Date;
};

export type ListConversationsFilters = { mode?: ConversationMode; assignee?: string };
export type ListConversationsPagination = { page: number; limit: number };

// spec.md Assumptions: "não lida" é computado, sem campo novo —
// lastInboundAt > lastActivityAt. Ausência de lastInboundAt (nenhuma
// mensagem recebida ainda) sempre resolve pra false.
const isUnread = (doc: ConversationDocument): boolean =>
  !!doc.lastInboundAt && doc.lastInboundAt.getTime() > doc.lastActivityAt.getTime();

const toListItem = (doc: ConversationDocument): ConversationListItem => ({
  id: doc._id.toString(),
  customer: doc.Customer.toString(),
  mode: doc.mode,
  assignee: doc.assignee?.toString(),
  lastActivityAt: doc.lastActivityAt,
  unread: isUnread(doc),
  windowOpen: !!doc.windowExpiresAt && doc.windowExpiresAt.getTime() > Date.now(),
  windowExpiresAt: doc.windowExpiresAt,
});

// INBOX-01/03: fila de conversas do tenant da sessão, com filtro opcional
// por mode/assignee e paginação server-side (AD-028). Ordena por
// lastActivityAt desc (mais recentemente ativa primeiro) — mesmo índice já
// existente {Tenant,mode,lastActivityAt} (AIG-33/T31).
export const listConversations = async (
  tenantId: string,
  filters: ListConversationsFilters,
  pagination: ListConversationsPagination,
): Promise<{ items: ConversationListItem[]; total: number }> =>
  withDbTiming('conversation.listConversations', async () => {
    const filter = tenantScoped({
      Tenant: tenantId,
      ...(filters.mode ? { mode: filters.mode } : {}),
      ...(filters.assignee ? { assignee: filters.assignee } : {}),
    });
    const skip = (pagination.page - 1) * pagination.limit;

    const [docs, total] = await Promise.all([
      Conversation.find(filter).sort({ lastActivityAt: -1 }).skip(skip).limit(pagination.limit).lean(),
      Conversation.countDocuments(filter),
    ]);

    return { items: docs.map(toListItem), total };
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

export type MessageListItem = {
  id: string;
  direction: MessageDocument['direction'];
  type: MessageDocument['type'];
  status?: MessageDocument['status'];
  text?: string;
  media?: MessageDocument['media'];
  templateName?: string;
  templateLanguage?: string;
  templateParams?: Record<string, string>;
  createdAt: Date;
};

export type GetMessagesPagination = { page: number; limit: number };

const toMessageListItem = (doc: MessageDocument): MessageListItem => ({
  id: doc._id.toString(),
  direction: doc.direction,
  type: doc.type,
  status: doc.status,
  text: doc.text,
  media: doc.media,
  templateName: doc.templateName,
  templateLanguage: doc.templateLanguage,
  templateParams: doc.templateParams,
  createdAt: doc.createdAt,
});

// INBOX-05/06: histórico paginado de uma Conversation, em ordem cronológica
// (createdAt asc — mesmo índice já existente {Tenant,Conversation,createdAt}
// em message.model.ts, comentado lá como "histórico de uma Conversation, em
// ordem"). `null` quando a Conversation não existe ou é de outro tenant —
// mesmo idioma 404 de sendManualMessage/ConversationNotFoundError (quem
// chama, o service, traduz pra HTTP). Mensagem de mídia nunca carrega
// binário: `MessageDocument.media` (message.model.ts) já é só o ponteiro
// (mediaId/mime/caption) — nenhum campo de binário existe no schema.
export const getMessages = async (
  tenantId: string,
  conversationId: string,
  pagination: GetMessagesPagination,
): Promise<{ items: MessageListItem[]; total: number } | null> =>
  withDbTiming('conversation.getMessages', async () => {
    const conversation = await Conversation.findOne(tenantScoped({ _id: conversationId, Tenant: tenantId })).lean();
    if (!conversation) return null;

    const filter = tenantScoped({ Tenant: tenantId, Conversation: conversation._id });
    const skip = (pagination.page - 1) * pagination.limit;

    const [docs, total] = await Promise.all([
      Message.find(filter).sort({ createdAt: 1 }).skip(skip).limit(pagination.limit).lean(),
      Message.countDocuments(filter),
    ]);

    return { items: docs.map(toMessageListItem), total };
  });

export class MessageNotFoundError extends Error {
  constructor() {
    super('Mensagem não encontrada');
  }
}

export class MessageNotFailedError extends Error {
  constructor() {
    super('Só é possível reenviar uma mensagem com status failed');
  }
}

// INBOX-14/15 (context.md decisão #8): reenvio NUNCA reseta o documento
// original — a Message failed permanece intocada, visível na thread com seu
// selo de falha. Um clone NOVO nasce com status:'queued' e entra na fila
// normal do outbox, mesmo shape de criação de createOutboundMessage. Nunca
// carrega wamid/claimedBy/claimedAt/error do original: essas colunas são
// propriedade de escrita do ai-gateway/outbox sobre aquele documento
// específico (docs/architecture.md) — o clone começa sua própria vida.
export const resendMessage = async (
  tenantId: string,
  conversationId: string,
  messageId: string,
): Promise<MessageRecord> =>
  withDbTiming('conversation.resendMessage', async () => {
    const original = await Message.findOne(
      tenantScoped({ _id: messageId, Tenant: tenantId, Conversation: conversationId }),
    ).lean();
    if (!original) throw new MessageNotFoundError();
    if (original.status !== 'failed') throw new MessageNotFailedError();

    const clone = await Message.create({
      Tenant: original.Tenant,
      Conversation: original.Conversation,
      Channel: original.Channel,
      Customer: original.Customer,
      direction: original.direction,
      type: original.type,
      status: 'queued',
      ...(original.text !== undefined ? { text: original.text } : {}),
      ...(original.templateName !== undefined
        ? {
            templateName: original.templateName,
            templateLanguage: original.templateLanguage,
            templateParams: original.templateParams,
          }
        : {}),
    });

    return {
      id: clone._id.toString(),
      status: clone.status as string,
      text: clone.text,
      templateName: clone.templateName,
      templateLanguage: clone.templateLanguage,
      templateParams: clone.templateParams,
    };
  });
