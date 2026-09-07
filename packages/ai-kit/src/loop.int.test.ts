import crypto from 'node:crypto';
import type Anthropic from '@anthropic-ai/sdk';
import { connect, disconnect, FieldTemplate, FieldTemplateVersion } from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { runLoop } from './loop.js';
import type { AnthropicClient, AnthropicMessage } from './providers/anthropicClient.js';
import type { ToolContext } from './tools/toolContext.js';
import { TOOL_DEFINITIONS } from './tools/toolDefinitions.js';

const randomId = (): string => crypto.randomBytes(12).toString('hex');

const baseCtx = (tenantId: string): ToolContext => ({
  tenantId,
  channelId: randomId(),
  conversationId: randomId(),
});

// Forma mínima de resposta fake — deliberadamente mais solta que
// Anthropic.Message (que exige campos como `citations`/`caller` em cada
// bloco, irrelevantes para este teste). Cast único no ponto de retorno.
type FakeResponse = {
  content: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>;
  stop_reason: string;
};

// Fake determinístico do client Anthropic (T11, injetável) — NUNCA a SDK
// real. Devolve as respostas em ordem; a última se repete se o loop chamar
// mais vezes do que o array tem. `calls` guarda um clone estrutural dos
// params de CADA chamada — `runLoop` reusa o MESMO array `messages` (dando
// `.push()`) em toda iteração, então inspecionar `mock.calls[i][0]` depois do
// loop terminar veria o array já mutado pelas iterações seguintes; o clone
// captura o estado exato no momento daquela chamada.
const createFakeClient = (
  responses: FakeResponse[],
): AnthropicClient & {
  createMessage: ReturnType<typeof vi.fn>;
  calls: Anthropic.MessageCreateParamsNonStreaming[];
} => {
  let call = 0;
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const createMessage = vi.fn(async (params: Anthropic.MessageCreateParamsNonStreaming) => {
    calls.push(structuredClone(params));
    const res = responses[Math.min(call, responses.length - 1)];
    call++;
    return res as unknown as AnthropicMessage;
  });
  return { createMessage, calls };
};

const seedProcessTemplate = async (tenant: string, key: string, stages: string[]) => {
  const template = await FieldTemplate.create({
    Tenant: tenant,
    targetType: 'process',
    key,
    name: 'Orçamento',
    currentVersion: 1,
    archived: false,
  });
  await FieldTemplateVersion.create({
    Tenant: tenant,
    template: template._id,
    targetType: 'process',
    version: 1,
    fields: [{ fieldId: 'motivo', label: 'Motivo', type: 'text', required: true }],
    stages,
  });
  return template;
};

const lastToolResultContent = (params: Anthropic.MessageCreateParamsNonStreaming): Anthropic.ToolResultBlockParam => {
  const lastMessage = params.messages[params.messages.length - 1];
  const blocks = lastMessage.content as Anthropic.ToolResultBlockParam[];
  return blocks[0];
};

describe('runLoop (AIG-14/20)', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
  });

  afterEach(async () => {
    await FieldTemplate.deleteMany({});
    await FieldTemplateVersion.deleteMany({});
  });

  afterAll(async () => {
    await disconnect();
  });

  it('extracts the final text and stops as soon as stop_reason !== "tool_use" (single iteration)', async () => {
    const client = createFakeClient([{ content: [{ type: 'text', text: 'oi tudo bem' }], stop_reason: 'end_turn' }]);

    const result = await runLoop(client, baseCtx(randomId()), 'system', [{ role: 'user', content: 'oi' }]);

    expect(result.reply).toBe('oi tudo bem');
    expect(client.createMessage).toHaveBeenCalledTimes(1);
    expect(client.calls[0].model).toBe('claude-haiku-4-5');
    expect(client.calls[0].tools).toEqual(TOOL_DEFINITIONS);
  });

  it("calls the right executor with the model's input + the SERVER's ctx — a tenantId forged into input is ignored", async () => {
    const tenant = randomId();
    const otherTenant = randomId();
    await seedProcessTemplate(tenant, 'orcamento', ['novo', 'fechado']);
    await seedProcessTemplate(otherTenant, 'orcamento', ['outro-stage']);
    const client = createFakeClient([
      {
        content: [
          {
            type: 'tool_use',
            id: 't1',
            name: 'get_process_template',
            input: { key: 'orcamento', tenantId: otherTenant },
          },
        ],
        stop_reason: 'tool_use',
      },
      { content: [{ type: 'text', text: 'pronto' }], stop_reason: 'end_turn' },
    ]);

    const result = await runLoop(client, baseCtx(tenant), 'system', [{ role: 'user', content: 'abrir processo' }]);

    expect(result.reply).toBe('pronto');
    expect(client.createMessage).toHaveBeenCalledTimes(2);
    const toolResult = lastToolResultContent(client.calls[1]);
    const payload = JSON.parse(toolResult.content as string);
    // stages da tool refletem o Tenant do CTX (tenant), nunca o tenantId forjado no input (otherTenant).
    expect(payload).toEqual({ fields: expect.any(Object), stages: ['novo', 'fechado'] });
  });

  it('a tool executor that returns {error} becomes a tool_result with is_error:true and logs a structured tool_error event (AIG-44)', async () => {
    const tenant = randomId();
    const client = createFakeClient([
      {
        content: [{ type: 'tool_use', id: 't1', name: 'get_process_template', input: { key: 'inexistente' } }],
        stop_reason: 'tool_use',
      },
      { content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' },
    ]);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await runLoop(client, baseCtx(tenant), 'system', [{ role: 'user', content: 'oi' }]);

    const toolResult = lastToolResultContent(client.calls[1]);
    expect(toolResult.is_error).toBe(true);
    expect(JSON.parse(toolResult.content as string)).toEqual({ error: expect.any(String) });
    const loggedEvents = logSpy.mock.calls.map(([arg]) => JSON.parse(arg as string));
    expect(loggedEvents).toContainEqual({ event: 'tool_error', tool: 'get_process_template' });
    logSpy.mockRestore();
  });

  it('stops at the 5th iteration still requesting a tool, using the partial text from that last turn', async () => {
    const tenant = randomId();
    const toolUseCall = {
      type: 'tool_use' as const,
      id: 't1',
      name: 'get_process_template',
      input: { key: 'inexistente' },
    };
    const responses = Array.from({ length: 5 }, (_, i) =>
      i === 4
        ? {
            content: [{ type: 'text', text: 'ainda buscando os dados...' }, toolUseCall],
            stop_reason: 'tool_use' as const,
          }
        : { content: [toolUseCall], stop_reason: 'tool_use' as const },
    );
    const client = createFakeClient(responses);

    const result = await runLoop(client, baseCtx(tenant), 'system', [{ role: 'user', content: 'oi' }]);

    expect(result.reply).toBe('ainda buscando os dados...');
    expect(client.createMessage).toHaveBeenCalledTimes(5);
  });

  it('falls back to a fixed reply when the 5th iteration has no text at all', async () => {
    const tenant = randomId();
    const toolUseCall = {
      type: 'tool_use' as const,
      id: 't1',
      name: 'get_process_template',
      input: { key: 'inexistente' },
    };
    const responses = Array.from({ length: 5 }, () => ({ content: [toolUseCall], stop_reason: 'tool_use' as const }));
    const client = createFakeClient(responses);

    const result = await runLoop(client, baseCtx(tenant), 'system', [{ role: 'user', content: 'oi' }]);

    expect(result.reply).toBe('Desculpe, não consegui responder agora. Pode reformular?');
  });

  it('propagates an error thrown by the (mocked) Anthropic client — never swallows it', async () => {
    const client: AnthropicClient = {
      createMessage: vi.fn().mockRejectedValueOnce(new Error('Anthropic indisponível')),
    };

    await expect(runLoop(client, baseCtx(randomId()), 'system', [{ role: 'user', content: 'oi' }])).rejects.toThrow(
      'Anthropic indisponível',
    );
  });
});
