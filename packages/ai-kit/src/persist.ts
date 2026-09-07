import type Anthropic from '@anthropic-ai/sdk';
import { AiSession, type AiSessionDocument, Message, type MessageDocument, releaseTurnLock } from '@crm/db';
import type { AnthropicClient } from './providers/anthropicClient.js';

// Forma mínima desacoplada de ConversationDocument (que tipa estes campos
// como ObjectId) — mesma convenção de string usada em ToolContext/ingest.ts:
// quem chama (runTurn, T24) já tem os ids como string.
export type PersistConversation = { _id: string; Tenant: string; Channel: string; Customer: string };
export type PersistAiSession = Pick<AiSessionDocument, '_id' | 'rawHistory' | 'summary' | 'totalMessageCount'>;

// spec.md Assumptions / design.md AiSession.totalMessageCount: mantém as
// últimas 20 mensagens brutas; ao cruzar o limiar de 20+10 = 30, resume as
// 10 mais antigas (soma ao summary rolante) e mantém só as 20 mais recentes.
const RAW_HISTORY_CAP = 20;
const RAW_HISTORY_TRIGGER = RAW_HISTORY_CAP + 10;

// AD-008: mesmo modelo do loop principal — o resumo rolante é só mais uma
// chamada ao claude-haiku-4-5, sem tools.
const SUMMARY_MODEL = 'claude-haiku-4-5';
const SUMMARY_MAX_TOKENS = 512;

// Duplicação deliberada e mínima de extractText (loop.ts também tem a sua) —
// persist.ts não declara T21 como dependência (Depends on: T6, T11) e as duas
// versões operam sobre formas de conteúdo ligeiramente diferentes; manter
// cada arquivo autocontido evita acoplamento desnecessário por uma função de
// 4 linhas.
const extractText = (content: Anthropic.ContentBlock[]): string =>
  content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

// Resumo rolante (AIG-23): uma chamada adicional ao mesmo client injetado —
// nunca a SDK real fora de providers/anthropicClient.ts. Se o modelo não
// devolver texto nenhum (caso degenerado), preserva o summary anterior em vez
// de apagá-lo.
const rollingSummary = async (
  client: AnthropicClient,
  priorSummary: string | undefined,
  toSummarize: Anthropic.MessageParam[],
): Promise<string> => {
  const response = await client.createMessage({
    model: SUMMARY_MODEL,
    max_tokens: SUMMARY_MAX_TOKENS,
    system:
      'Resuma a conversa abaixo em português, de forma objetiva, preservando fatos e decisões importantes para o atendimento continuar depois.',
    messages: [
      ...(priorSummary ? [{ role: 'user' as const, content: `Resumo anterior: ${priorSummary}` }] : []),
      ...toSummarize,
      { role: 'user' as const, content: 'Resuma tudo acima em um parágrafo curto, em português.' },
    ],
  });
  return extractText(response.content) || priorSummary || '';
};

// persist: grava a Message{direction:'out'} do turno (já com status:'queued'
// — o schema de packages/db exige um status válido em toda Message 'out' já
// na criação; não existe um estado "rascunho" no enum, então o mesmo insert
// que persiste o turno já É a entrada na outbox, AIG-24) e atualiza o
// AiSession (histórico bruto + resumo rolante quando cruza o limiar).
// `turnMessages` é o que ESTE turno gerou (turno do usuário + saída do loop,
// T21) — nunca o bloco dinâmico de `contextBuild`, para não duplicar
// contexto stale no histórico salvo (ver nota em loop.ts).
export const persist = async (
  client: AnthropicClient,
  conversation: PersistConversation,
  aiSession: PersistAiSession,
  turnMessages: Anthropic.MessageParam[],
  outText: string,
): Promise<MessageDocument> => {
  const message = await Message.create({
    Tenant: conversation.Tenant,
    Conversation: conversation._id,
    Channel: conversation.Channel,
    Customer: conversation.Customer,
    direction: 'out',
    type: 'text',
    status: 'queued',
    text: outText,
  });

  const grownHistory = [...aiSession.rawHistory, ...turnMessages];
  const totalMessageCount = aiSession.totalMessageCount + turnMessages.length;

  let rawHistory = grownHistory;
  let summary = aiSession.summary;
  if (grownHistory.length >= RAW_HISTORY_TRIGGER) {
    const toSummarize = grownHistory.slice(0, grownHistory.length - RAW_HISTORY_CAP) as Anthropic.MessageParam[];
    summary = await rollingSummary(client, aiSession.summary, toSummarize);
    rawHistory = grownHistory.slice(grownHistory.length - RAW_HISTORY_CAP);
  }

  const setFields: Record<string, unknown> = { rawHistory, totalMessageCount, lastRunAt: new Date() };
  if (summary !== undefined) setFields.summary = summary;
  await AiSession.updateOne({ _id: aiSession._id }, { $set: setFields });

  return message;
};

// dispatch: libera o turnLock ao final do turno (T18 reivindicou) — a
// próxima ingest da mesma Conversation consegue reivindicar imediatamente
// depois. O `status:'queued'` já foi gravado por `persist` acima; dispatch
// não repete essa escrita.
export const dispatch = async (message: Pick<MessageDocument, 'Conversation'>): Promise<void> => {
  await releaseTurnLock(message.Conversation.toString());
};

// T24B (gap found by the orchestrator before Batch 4, no new AD — mirrors
// T25B's pattern from crm-web-shell): guard.input rejeitado (tamanho/rate
// limit) nunca engaja o modelo, mas o cliente ainda precisa receber o aviso
// fixo — spec.md Assumptions ("cliente recebe no máximo 1 aviso fixo por
// janela de 60s") exige isso, e runTurn (T24) devolvia o `fixedReply` sem
// nunca persistir/despachar uma Message — o texto nunca chegava ao WhatsApp.
// Reusa o mesmo Message{direction:'out',status:'queued'}+outbox de sempre,
// sem tocar AiSession (não é um turno do modelo — não entra no
// histórico/resumo rolante). Libera o turnLock do mesmo jeito que dispatch().
export const dispatchFixedReply = async (
  conversation: PersistConversation,
  fixedReply: string,
): Promise<MessageDocument> => {
  const message = await Message.create({
    Tenant: conversation.Tenant,
    Conversation: conversation._id,
    Channel: conversation.Channel,
    Customer: conversation.Customer,
    direction: 'out',
    type: 'text',
    status: 'queued',
    text: fixedReply,
  });
  await releaseTurnLock(conversation._id.toString());
  return message;
};
