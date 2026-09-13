import type Anthropic from '@anthropic-ai/sdk';
import { AiSession, type AiSessionDocument, releaseTurnLock, Tenant } from '@crm/db';
import { contextBuild } from './contextBuild.js';
import { guardInput } from './guardInput.js';
import { guardOutput } from './guardOutput.js';
import { checkConversationMode, type IngestInput, type IngestOptions, ingest } from './ingest.js';
import { runLoop } from './loop.js';
import { dispatch, dispatchFixedReply, type PersistConversation, persist } from './persist.js';
import type { AnthropicClient } from './providers/anthropicClient.js';
import type { AsaasClient } from './providers/asaasClient.js';
import type { ToolContext } from './tools/toolContext.js';

// Error Handling Strategy (design.md): Anthropic indisponível → Message{in}
// já persistida não se perde, resposta de fallback fixa, ainda 200.
const FALLBACK_UNAVAILABLE_REPLY =
  'Estamos com uma instabilidade no momento. Por favor, tente novamente em alguns instantes.';

export type RunTurnOutcome =
  | { outcome: 'not_resolved' }
  | { outcome: 'duplicate' }
  | { outcome: 'human_mode' }
  | { outcome: 'guard_rejected'; fixedReply: string }
  | { outcome: 'sent'; reply: string }
  | { outcome: 'fallback'; reply: string };

// `asaasClient` (payments-asaas T17): sibling field to `ingestOptions`, NOT nested
// under it (design.md Tech Decisions) — `ingestOptions` feeds `ingest()` (pre-loop,
// audio-transcription-shaped); `asaasClient` is read by `issue_payment_link`, a Ring B
// TOOL executed inside `runLoop`/`executeTool`. A different pipeline stage needs it,
// so it gets its own seam instead of conflating the two.
// `webBaseUrl` (scheduling T27/T29): same shape as `asaasClient` — read only by
// `book_appointment`, a Ring A tool. No package reads `process.env` directly
// (design.md Research Provenance); this is how the value reaches the tool.
export type RunTurnOptions = { ingestOptions?: IngestOptions; asaasClient?: AsaasClient; webBaseUrl?: string };

// catalog-orders T16 (design.md "guard.output — extensão de escopo de
// preço"): extrai os tool_results que este turno realmente produziu, já
// parseados de JSON, pra alimentar a regra de preço de guardOutput.ts — um
// segundo consumidor de `rawTurn`, independente de persist() (loop.ts
// intercala mensagens assistant/tool_result; cada bloco tool_result.content
// é a STRING `JSON.stringify(result)` que executeTool produziu).
const extractToolResultsThisTurn = (rawTurn: Anthropic.MessageParam[]): unknown[] => {
  const results: unknown[] = [];
  for (const message of rawTurn) {
    if (!Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (typeof block !== 'object' || block === null || !('type' in block) || block.type !== 'tool_result') continue;
      const toolResult = block as Anthropic.ToolResultBlockParam;
      if (typeof toolResult.content !== 'string') continue;
      try {
        results.push(JSON.parse(toolResult.content));
      } catch {
        // tool_result malformado (nunca deveria acontecer — executeTool
        // sempre serializa via JSON.stringify): ignora, guardOutput
        // simplesmente não enxerga esse resultado específico.
      }
    }
  }
  return results;
};

// Mesmo idioma de findOrCreateConversation (ingest.ts) — upsert atômico por
// Conversation, único (schema: {Conversation:1} unique).
const findOrCreateAiSession = async (tenantId: string, conversationId: string): Promise<AiSessionDocument> => {
  return AiSession.findOneAndUpdate(
    { Conversation: conversationId },
    { $setOnInsert: { Tenant: tenantId } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  ).lean();
};

// runTurn: orquestra o pipeline inteiro (design.md) —
// ingest→guardInput→checkConversationMode→contextBuild→runLoop→guardOutput→
// persist→dispatch. Nunca lança: qualquer erro nas etapas de modelo/tool cai
// num fallback de texto fixo (a Message{in} já persistida por `ingest` nunca
// se perde) — quem chama sempre recebe um outcome, nunca uma exception não
// tratada (AIG-20/Error Handling Strategy). `client` é injetado (T11) — todo
// teste usa um fake determinístico, nunca a SDK real.
export const runTurn = async (
  client: AnthropicClient,
  input: IngestInput,
  opts: RunTurnOptions = {},
): Promise<RunTurnOutcome> => {
  const ingestResult = await ingest(input, opts.ingestOptions);
  if (!ingestResult.resolved) return { outcome: 'not_resolved' };
  if (ingestResult.isDuplicate) return { outcome: 'duplicate' };

  const { channel, conversation, message, audioTranscription } = ingestResult;
  const tenantId = channel.Tenant.toString();
  const conversationId = conversation._id.toString();
  const persistConversation: PersistConversation = {
    _id: conversationId,
    Tenant: tenantId,
    Channel: channel._id.toString(),
    Customer: conversation.Customer.toString(),
  };

  // T24B (gap found by the orchestrator before Batch 4, no new AD — mirrors
  // T25B's pattern from crm-web-shell): both early-return branches below used
  // to skip releasing the turnLock ingest() claimed, since only dispatch()
  // (never reached on these paths) released it — every later message on the
  // SAME Conversation would then always burn the full poll ceiling forever.
  // human_mode: no bot reply is ever sent (an operator handles it manually,
  // T37-40), so just release the lock, no Message is persisted here.
  if (checkConversationMode(conversation)) {
    await releaseTurnLock(conversationId);
    return { outcome: 'human_mode' };
  }

  // P2 (T47, AIG-46): áudio transcrito com sucesso por `ingest` (opts.
  // ingestOptions.downloadAudio/whisperClient) chega aqui como
  // `transcribedText` — guardInput.ts trata isso exatamente como o texto
  // digitado (tamanho, rate limit). Sem transcrição (P1, ou falha do
  // Whisper/Meta), `transcribedText` fica undefined e o tipo cai no
  // fallback fixo já existente (T19), sem mudança de comportamento.
  const transcribedText = audioTranscription && 'text' in audioTranscription ? audioTranscription.text : undefined;
  const guardResult = await guardInput({ type: message.type, text: message.text, transcribedText }, conversation);
  // guard_rejected: the customer still needs the fixed reply delivered
  // (spec.md Assumptions — rate-limit row: "cliente recebe no máximo 1 aviso
  // fixo por janela de 60s") — dispatchFixedReply queues it the same way a
  // normal reply is queued, and releases the lock. AIG-11 fix: when
  // guardInput throttles the rate-limit warning (already warned this
  // window), `fixedReply` is undefined — no Message is queued, but the
  // turnLock still needs releasing (same T24B reasoning: dispatchFixedReply
  // was the only thing releasing it on this path). `fixedReply` on the
  // returned outcome stays '' in the throttled case (no canonical text was
  // actually dispatched) — callers that care about the queued Message count
  // must look at persisted Messages, not this field.
  if (!guardResult.ok) {
    if (guardResult.fixedReply) {
      await dispatchFixedReply(persistConversation, guardResult.fixedReply);
    } else {
      await releaseTurnLock(conversationId);
    }
    return { outcome: 'guard_rejected', fixedReply: guardResult.fixedReply ?? '' };
  }

  const tenant = await Tenant.findById(tenantId).lean();
  const aiSession = await findOrCreateAiSession(tenantId, conversationId);

  const contextResult = await contextBuild(
    { tenantId, name: tenant?.name ?? '' },
    { windowExpiresAt: conversation.windowExpiresAt },
    { rawHistory: aiSession.rawHistory, summary: aiSession.summary },
    guardResult.text,
  );

  const ctx: ToolContext = {
    tenantId,
    channelId: channel._id.toString(),
    conversationId,
    asaasClient: opts.asaasClient,
    webBaseUrl: opts.webBaseUrl,
  };

  let reply: string;
  let rawTurn: Anthropic.MessageParam[] = [];
  let isFallback = false;
  try {
    const loopResult = await runLoop(client, ctx, contextResult.system, contextResult.messages);
    reply = loopResult.reply;
    rawTurn = loopResult.rawTurn;
  } catch {
    reply = FALLBACK_UNAVAILABLE_REPLY;
    isFallback = true;
  }

  // catalog-orders T16: guardOutput recebe os tool_results REAIS deste turno
  // (regra de preço, CAT-25/26/27) — extraídos de `rawTurn`, a mesma fonte
  // que persist() já usa pra montar o histórico salvo (design.md: "Só tool
  // results deste turno").
  const guardedReply = guardOutput(reply, extractToolResultsThisTurn(rawTurn));
  const turnMessages: Anthropic.MessageParam[] = [{ role: 'user', content: guardResult.text }, ...rawTurn];
  const outMessage = await persist(client, persistConversation, aiSession, turnMessages, guardedReply);
  await dispatch(outMessage);

  return isFallback ? { outcome: 'fallback', reply: guardedReply } : { outcome: 'sent', reply: guardedReply };
};
