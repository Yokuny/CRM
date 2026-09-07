import type Anthropic from '@anthropic-ai/sdk';
import { AiSession, type AiSessionDocument, Tenant } from '@crm/db';
import { contextBuild } from './contextBuild.js';
import { guardInput } from './guardInput.js';
import { guardOutput } from './guardOutput.js';
import { checkConversationMode, type IngestInput, type IngestOptions, ingest } from './ingest.js';
import { runLoop } from './loop.js';
import { dispatch, type PersistConversation, persist } from './persist.js';
import type { AnthropicClient } from './providers/anthropicClient.js';
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

export type RunTurnOptions = { ingestOptions?: IngestOptions };

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
//
// SPEC_DEVIATION: `guard_rejected` devolve o `fixedReply` sem passar por
// `persist`/`dispatch` — nem spec.md/design.md nem a Error Handling Strategy
// definem o mecanismo de fila para esse caso especificamente (a tabela lista
// "Anthropic indisponível", "Meta falha", "janela de 24h", mas nenhuma linha
// para "guard.input rejeitado"), então nenhum shape de `turnMessages` foi
// inventado aqui para não chutar um contrato não especificado. AIG-10 AC6
// ("responder com uma mensagem fixa") continua parcialmente aberto — fica
// para uma task futura que toque o fluxo de webhook/outbox decidir.
export const runTurn = async (
  client: AnthropicClient,
  input: IngestInput,
  opts: RunTurnOptions = {},
): Promise<RunTurnOutcome> => {
  const ingestResult = await ingest(input, opts.ingestOptions);
  if (!ingestResult.resolved) return { outcome: 'not_resolved' };
  if (ingestResult.isDuplicate) return { outcome: 'duplicate' };

  const { channel, conversation, message } = ingestResult;
  const tenantId = channel.Tenant.toString();

  if (checkConversationMode(conversation)) return { outcome: 'human_mode' };

  const guardResult = await guardInput(message, conversation);
  if (!guardResult.ok) return { outcome: 'guard_rejected', fixedReply: guardResult.fixedReply };

  const tenant = await Tenant.findById(tenantId).lean();
  const conversationId = conversation._id.toString();
  const aiSession = await findOrCreateAiSession(tenantId, conversationId);

  const contextResult = await contextBuild(
    { tenantId, name: tenant?.name ?? '' },
    { windowExpiresAt: conversation.windowExpiresAt },
    { rawHistory: aiSession.rawHistory, summary: aiSession.summary },
    guardResult.text,
  );

  const ctx: ToolContext = { tenantId, channelId: channel._id.toString(), conversationId };

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

  const guardedReply = guardOutput(reply);
  const turnMessages: Anthropic.MessageParam[] = [{ role: 'user', content: guardResult.text }, ...rawTurn];
  const persistConversation: PersistConversation = {
    _id: conversationId,
    Tenant: tenantId,
    Channel: channel._id.toString(),
    Customer: conversation.Customer.toString(),
  };
  const outMessage = await persist(client, persistConversation, aiSession, turnMessages, guardedReply);
  await dispatch(outMessage);

  return isFallback ? { outcome: 'fallback', reply: guardedReply } : { outcome: 'sent', reply: guardedReply };
};
