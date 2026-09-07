import { Conversation, type ConversationDocument, type MessageDocument } from '@crm/db';

export type GuardInputMessage = Pick<MessageDocument, 'type' | 'text'>;
export type GuardInputResult = { ok: true; text: string } | { ok: false; fixedReply: string };

// AIG-10 / context.md: nenhum número é fixado em spec/design/tasks para o
// limite de ENTRADA (só o de SAÍDA, 1600 chars — guardOutput/T22 — é
// confirmado por busca externa). Spec-precision gap: usa a mesma ordem de
// grandeza do teto de texto documentado pela Meta Cloud API (4096 chars por
// mensagem) até o produto real pedir outro valor.
export const MAX_INPUT_TEXT_LENGTH = 4096;

// spec.md Assumptions: 20 mensagens / 60s por (Tenant,Customer). A
// Conversation é a chave {Channel,Customer} (v1: 1 Channel por Tenant), então
// o contador vive nela mesma (design.md Tech Decisions — rateWindowStart/
// rateWindowCount).
export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_MAX_MESSAGES = 20;

export const UNSUPPORTED_TYPE_REPLY = 'Não consigo processar esse tipo de conteúdo. Pode escrever em texto?';
export const TOO_LONG_REPLY = 'Sua mensagem é muito longa. Pode resumir ou dividir em partes menores?';
export const RATE_LIMITED_REPLY = 'Você está enviando mensagens muito rápido. Aguarde um instante antes de continuar.';

// Rate limit atômico (AIG-11) — mesmo espírito do claim do turnLock (T18,
// ADR-0007-like): a janela vive só no documento Conversation, nunca em
// memória do processo (funciona igual com 1 ou N instâncias do ai-gateway).
// Dois findOneAndUpdate com filtros excludentes, nunca um read-then-write:
// (1) a janela expirou/nunca existiu → reset atômico; (2) está fresca e
// ainda sob o teto → incremento atômico; se nenhum dos dois casar (fresca E
// no teto), nenhuma escrita acontece — rejeita.
const bumpRateLimit = async (conversationId: string, now: Date): Promise<boolean> => {
  const staleThreshold = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS);

  const reset = await Conversation.findOneAndUpdate(
    {
      _id: conversationId,
      $or: [{ rateWindowStart: { $exists: false } }, { rateWindowStart: { $lt: staleThreshold } }],
    },
    { $set: { rateWindowStart: now, rateWindowCount: 1 } },
    { returnDocument: 'after' },
  ).lean();
  if (reset) return true;

  const bumped = await Conversation.findOneAndUpdate(
    { _id: conversationId, rateWindowCount: { $lt: RATE_LIMIT_MAX_MESSAGES } },
    { $inc: { rateWindowCount: 1 } },
    { returnDocument: 'after' },
  ).lean();
  return bumped !== null;
};

// guardInput: gate de tipo (só texto processa nesta task — áudio entra em
// T47), gate de tamanho, rate limit atômico (AIG-10/11). `message`/
// `conversation` já foram persistidos pelo `ingest` (T18) — guardInput nunca
// persiste nada, só decide se o turno segue para o loop.
export const guardInput = async (
  message: GuardInputMessage,
  conversation: Pick<ConversationDocument, '_id'>,
): Promise<GuardInputResult> => {
  if (message.type !== 'text') return { ok: false, fixedReply: UNSUPPORTED_TYPE_REPLY };

  const text = message.text ?? '';
  if (text.length > MAX_INPUT_TEXT_LENGTH) return { ok: false, fixedReply: TOO_LONG_REPLY };

  const withinLimit = await bumpRateLimit(conversation._id.toString(), new Date());
  if (!withinLimit) return { ok: false, fixedReply: RATE_LIMITED_REPLY };

  return { ok: true, text };
};
