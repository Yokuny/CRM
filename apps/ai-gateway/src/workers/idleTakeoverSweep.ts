import { Conversation } from '@crm/db';

// AIG-33: Conversation{mode:'human'} sem nenhuma ação do operador há mais de
// idleAfterMs volta sozinha para 'bot', limpando o assignee — reforça
// AIG-08/09/12/32 (nunca deixa um takeover esquecido matar a automação por
// horas). Só `mode:'human'` participa do filtro — 'bot' nunca é tocado
// (índice {Tenant,mode,lastActivityAt}, T3).
export const sweepIdleConversations = async (idleAfterMs = 1800000): Promise<number> => {
  const idleBefore = new Date(Date.now() - idleAfterMs);
  const result = await Conversation.updateMany(
    { mode: 'human', lastActivityAt: { $lt: idleBefore } },
    { $set: { mode: 'bot' }, $unset: { assignee: '' } },
  );
  return result.modifiedCount;
};

export type IdleTakeoverSweepHandle = { stop: () => void };

// design.md: startIdleTakeoverSweep(intervalMs=60000, idleAfterMs=1800000).
export const startIdleTakeoverSweep = (intervalMs = 60000, idleAfterMs = 1800000): IdleTakeoverSweepHandle => {
  const handle = setInterval(() => {
    void sweepIdleConversations(idleAfterMs).catch((err) => {
      console.error(
        JSON.stringify({
          event: 'idle_takeover_sweep.tick_failed',
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    });
  }, intervalMs);

  return { stop: () => clearInterval(handle) };
};
