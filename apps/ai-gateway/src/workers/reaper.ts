import { Message } from '@crm/db';

// AIG-30/ADR-0007: uma mensagem presa em 'sending' por mais de staleAfterMs
// (crash do processo entre o claim e o envio, ex.) volta para 'queued' — mas
// NUNCA quando o wamid já foi gravado (protege contra reenvio duplicado
// visível ao cliente; ver outboxConsumer.ts, markSent grava wamid antes de
// 'sent'). `wamid: {$exists:false}` é exatamente essa proteção.
export const reapStuckMessages = async (staleAfterMs = 60000): Promise<number> => {
  const staleBefore = new Date(Date.now() - staleAfterMs);
  const result = await Message.updateMany(
    { direction: 'out', status: 'sending', claimedAt: { $lt: staleBefore }, wamid: { $exists: false } },
    { $set: { status: 'queued' }, $unset: { claimedBy: '', claimedAt: '' } },
  );
  return result.modifiedCount;
};

export type ReaperHandle = { stop: () => void };

// design.md: startReaper(intervalMs=30000, staleAfterMs=60000).
export const startReaper = (intervalMs = 30000, staleAfterMs = 60000): ReaperHandle => {
  const handle = setInterval(() => {
    void reapStuckMessages(staleAfterMs).catch((err) => {
      console.error(
        JSON.stringify({ event: 'reaper.tick_failed', message: err instanceof Error ? err.message : String(err) }),
      );
    });
  }, intervalMs);

  return { stop: () => clearInterval(handle) };
};
