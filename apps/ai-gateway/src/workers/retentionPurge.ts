import { AiSession, Conversation, Message } from '@crm/db';

// spec.md Assumptions: default recomendado quando a flag for ligada
// manualmente — nenhuma política real de retenção decidida ainda.
export const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;

// OPS-09/10/11: função pura, sem try/catch interno (erro é tratado pelo
// wrapper de intervalo, T6/startRetentionPurge) — mesmo espírito de
// reapStuckMessages (reaper.ts). Ordem de exclusão fixada em design.md
// (Component 3): Message/AiSession antes de Conversation, para nunca deixar
// órfão em caso de falha parcial entre os passos.
export const purgeExpiredConversations = async (
  retentionMs: number,
): Promise<{ conversations: number; messages: number; aiSessions: number }> => {
  const expiredBefore = new Date(Date.now() - retentionMs);
  const expired = await Conversation.find({ createdAt: { $lt: expiredBefore } }, { _id: 1 }).lean();
  const ids = expired.map((c) => c._id);

  if (ids.length === 0) {
    return { conversations: 0, messages: 0, aiSessions: 0 };
  }

  const messagesResult = await Message.deleteMany({ Conversation: { $in: ids } });
  const aiSessionsResult = await AiSession.deleteMany({ Conversation: { $in: ids } });
  const conversationsResult = await Conversation.deleteMany({ _id: { $in: ids } });

  return {
    conversations: conversationsResult.deletedCount ?? 0,
    messages: messagesResult.deletedCount ?? 0,
    aiSessions: aiSessionsResult.deletedCount ?? 0,
  };
};

export type RetentionPurgeHandle = { stop: () => void };

// OPS-08/09/12: mesma forma exata de startReaper (reaper.ts) — setInterval/
// clearInterval, handle {stop}, log JSON em console.error e segue rodando no
// próximo tick em caso de erro (nunca derruba o processo).
export const startRetentionPurge = (intervalMs = 86400000, retentionMs = TWELVE_MONTHS_MS): RetentionPurgeHandle => {
  const handle = setInterval(() => {
    void purgeExpiredConversations(retentionMs).catch((err) => {
      console.error(
        JSON.stringify({
          event: 'retentionPurge.tick_failed',
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    });
  }, intervalMs);

  return { stop: () => clearInterval(handle) };
};
