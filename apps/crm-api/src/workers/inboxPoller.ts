import { Conversation, type ConversationDocument, Message, type MessageDocument } from '@crm/db';
import type { InboxSocketServer, MessageWirePayload } from '../ws/inboxSocket.js';

const toWirePayload = (message: MessageDocument): MessageWirePayload => ({
  id: message._id.toString(),
  conversationId: message.Conversation.toString(),
  direction: message.direction,
  type: message.type,
  status: message.status,
  text: message.text,
  media: message.media,
  createdAt: message.createdAt.toISOString(),
});

// Mesma fórmula de "não lida" do spec.md Assumptions (lastInboundAt >
// lastActivityAt) — duplicada deliberadamente em vez de compartilhada com
// listConversations (T7), mesmo precedente já aceito no projeto pra
// predicados pequenos e de arquivo único (isWithinWindow duplicado entre
// conversation.repository.ts e outboxConsumer.ts).
const isUnread = (conversation: ConversationDocument): boolean =>
  !!conversation.lastInboundAt && conversation.lastInboundAt.getTime() > conversation.lastActivityAt.getTime();

// design.md, Componente 3: um tick isolado — busca Message atualizada desde
// `since`, só para tenants com pelo menos um socket conectado (AD-006), e
// distribui via InboxSocketServer.
//
// Cursor: a query é `$gte` (inclusiva), nunca `$gt`. Um cursor "since" gerado
// por `new Date()` e comparado com `$gt` tem uma falha real de fronteira —
// se uma Message for gravada no MESMO milissegundo em que `since` foi
// capturado (trivial de reproduzir contra o MongoMemoryServer dos testes,
// possível em produção sob carga), a comparação estrita a exclui pra sempre,
// já que o cursor só anda pra frente. Por isso o próximo cursor nunca é só
// "agora": quando a query encontra mensagens, o próximo `since` vira
// `max(updatedAt processado) + 1ms` (exclui exatamente o que já foi
// processado, sem reabrir a fronteira pro `$gte` reprocessar); quando não
// encontra nenhuma, avança pra `new Date()` (nada fica pra trás, nada foi
// visto ainda naquele instante).
export const pollOnce = async (socketServer: InboxSocketServer, since: Date): Promise<Date> => {
  const tenantIds = socketServer.getConnectedTenantIds();
  if (tenantIds.length === 0) return new Date();

  const messages = await Message.find({ updatedAt: { $gte: since }, Tenant: { $in: tenantIds } })
    .sort({ updatedAt: 1 })
    .lean();

  for (const message of messages) {
    const tenantId = message.Tenant.toString();
    const conversationId = message.Conversation.toString();

    socketServer.broadcastToConversation(tenantId, conversationId, {
      type: 'message.new',
      conversationId,
      message: toWirePayload(message),
    });

    const conversation = await Conversation.findById(message.Conversation).lean();
    if (!conversation) continue;

    socketServer.broadcastToTenant(tenantId, {
      type: 'conversation.updated',
      conversationId,
      lastActivityAt: conversation.lastActivityAt.toISOString(),
      unread: isUnread(conversation),
    });
  }

  if (messages.length === 0) return new Date();
  return new Date(messages[messages.length - 1].updatedAt.getTime() + 1);
};

export type InboxPollerHandle = { stop: () => void };

// design.md: startInboxPoller(intervalMs=2000) — mesmo molde setInterval +
// catch+log de startOutboxConsumer/startIdleTakeoverSweep. O cursor `since`
// só avança em caso de SUCESSO (fica em closure entre ticks): um tick que
// falhar nunca perde a janela que ainda não conseguiu processar — o próximo
// tick tenta de novo a partir do mesmo `since`.
export const startInboxPoller = (socketServer: InboxSocketServer, intervalMs = 2000): InboxPollerHandle => {
  let since = new Date();

  const handle = setInterval(() => {
    void pollOnce(socketServer, since)
      .then((next) => {
        since = next;
      })
      .catch((err) => {
        console.error(
          JSON.stringify({
            event: 'inbox_poller.tick_failed',
            message: err instanceof Error ? err.message : String(err),
          }),
        );
      });
  }, intervalMs);

  return { stop: () => clearInterval(handle) };
};
