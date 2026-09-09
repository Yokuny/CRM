import type Anthropic from '@anthropic-ai/sdk';
import type { AnthropicClient } from './providers/anthropicClient.js';
import { createOrder } from './tools/createOrder.js';
import { findOrCreateCustomer } from './tools/findOrCreateCustomer.js';
import { getOrderStatus } from './tools/getOrderStatus.js';
import { getProcessTemplate } from './tools/getProcessTemplate.js';
import { openProcess } from './tools/openProcess.js';
import { searchProducts } from './tools/searchProducts.js';
import { setProcessFields } from './tools/setProcessFields.js';
import type { ToolContext } from './tools/toolContext.js';
import { TOOL_DEFINITIONS } from './tools/toolDefinitions.js';

// AD-008: model ID sem sufixo de data.
const MODEL = 'claude-haiku-4-5';
const MAX_TOOL_ITERATIONS = 5;
const MAX_TOKENS = 1024;
const FALLBACK_REPLY = 'Desculpe, não consegui responder agora. Pode reformular?';

export type RunLoopResult = { reply: string; rawTurn: Anthropic.MessageParam[] };

const extractText = (content: Anthropic.ContentBlock[]): string =>
  content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

// Despacha tool_use para o executor certo (AD-010: ctx sempre do servidor,
// nunca do input do modelo). Superfície fixa — as 4 tools originais do Anel A
// (T14-T17) mais search_products/get_order_status (Anel A) e create_order
// (1ª tool do Anel B, AD-009, catalog-orders/T14); um nome fora dessas nunca
// deveria chegar aqui, já que `tools: TOOL_DEFINITIONS` só oferece essas 7 ao
// modelo, mas o fallback devolve `{error}` em vez de lançar, mesma convenção
// dos executores.
const executeTool = async (name: string, input: unknown, ctx: ToolContext): Promise<unknown> => {
  switch (name) {
    case 'get_process_template':
      return getProcessTemplate(input as Parameters<typeof getProcessTemplate>[0], ctx);
    case 'find_or_create_customer':
      return findOrCreateCustomer(input as Parameters<typeof findOrCreateCustomer>[0], ctx);
    case 'open_process':
      return openProcess(input as Parameters<typeof openProcess>[0], ctx);
    case 'set_process_fields':
      return setProcessFields(input as Parameters<typeof setProcessFields>[0], ctx);
    case 'search_products':
      return searchProducts(input as Parameters<typeof searchProducts>[0], ctx);
    case 'get_order_status':
      return getOrderStatus(input as Parameters<typeof getOrderStatus>[0], ctx);
    case 'create_order':
      return createOrder(input as Parameters<typeof createOrder>[0], ctx);
    default:
      return { error: `Tool desconhecida: ${name}` };
  }
};

const isErrorResult = (result: unknown): boolean => typeof result === 'object' && result !== null && 'error' in result;

// runLoop: loop de tool-calling do Anel A (AIG-14/20). `client` é injetado
// (providers/anthropicClient.ts, T11) — nunca importa @anthropic-ai/sdk
// diretamente aqui, então todo teste injeta um fake determinístico, nunca a
// SDK real. `rawTurn` devolve só o que este turno GEROU (mensagens de
// assistant + tool_result) — nunca a mensagem inicial do usuário (isso é
// responsabilidade de quem monta o histórico em `persist`, T23), para não
// duplicar o bloco dinâmico de `contextBuild` no histórico salvo.
export const runLoop = async (
  client: AnthropicClient,
  ctx: ToolContext,
  system: string,
  initialMessages: Anthropic.MessageParam[],
): Promise<RunLoopResult> => {
  const messages: Anthropic.MessageParam[] = [...initialMessages];
  const rawTurn: Anthropic.MessageParam[] = [];
  let reply = '';

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await client.createMessage({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      tools: TOOL_DEFINITIONS,
      messages,
    });

    const assistantMessage: Anthropic.MessageParam = { role: 'assistant', content: response.content };
    messages.push(assistantMessage);
    rawTurn.push(assistantMessage);

    if (response.stop_reason !== 'tool_use') {
      reply = extractText(response.content);
      break;
    }

    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
      let result: unknown;
      try {
        result = await executeTool(toolUse.name, toolUse.input, ctx);
      } catch (err) {
        result = { error: err instanceof Error ? err.message : 'Erro ao executar a operação.' };
      }
      const isError = isErrorResult(result);
      if (isError) console.log(JSON.stringify({ event: 'tool_error', tool: toolUse.name }));
      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: JSON.stringify(result),
        is_error: isError,
      });
    }

    const toolResultMessage: Anthropic.MessageParam = { role: 'user', content: toolResults };
    messages.push(toolResultMessage);
    rawTurn.push(toolResultMessage);

    // Teto de iterações atingido ainda pedindo tool (AIG-20): encerra com o
    // texto parcial deste último turno, ou o fallback fixo se não houver
    // texto nenhum — nunca trava a requisição.
    if (i === MAX_TOOL_ITERATIONS - 1) {
      reply = extractText(response.content) || FALLBACK_REPLY;
    }
  }

  if (!reply) reply = FALLBACK_REPLY;

  return { reply, rawTurn };
};
