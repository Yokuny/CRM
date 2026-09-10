import crypto from 'node:crypto';
import type Anthropic from '@anthropic-ai/sdk';
import type { AnthropicClient, AnthropicMessage, IngestInput } from '@crm/ai-kit';
import { runTurn } from '@crm/ai-kit';
import {
  Channel,
  Conversation,
  Customer,
  connect,
  disconnect,
  FieldTemplate,
  FieldTemplateVersion,
  Message,
  Process,
} from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { expectNoTool, expectTool } from '../runner/expectTool.js';

// Golden set — happy path (AIG-39, AIG-43): mensagem de texto abre um
// processo do zero via find_or_create_customer→open_process→set_process_fields,
// contra runTurn REAL (MongoMemoryServer, T24), com um client Anthropic FAKE
// determinístico (nunca a SDK real) que sempre pede a MESMA sequência de
// tools — mesmo padrão de runTurn.int.test.ts (packages/ai-kit), duplicado
// aqui deliberadamente (evals/ não depende de packages/ai-kit/src/*.test.ts,
// que nem é publicado pelo barrel).
const randomId = (): string => crypto.randomBytes(12).toString('hex');
const randomPhone = (): string => `119${crypto.randomInt(10000000, 99999999)}`;

type FakeContent = { type: string; text?: string; id?: string; name?: string; input?: unknown };
type FakeResponse = { content: FakeContent[]; stop_reason: string };

const endTurn = (text: string): FakeResponse => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn' });

const toolUse = (id: string, name: string, input: unknown): FakeResponse => ({
  content: [{ type: 'tool_use', id, name, input }],
  stop_reason: 'tool_use',
});

// O modelo real leria o tool_result da chamada anterior para saber o
// customerId/processId (gerados pelo Mongo em runtime, não previsíveis
// estaticamente) — este fake FAZ o mesmo: extrai o JSON do último
// tool_result do histórico recebido, em vez de uma lista de respostas fixa.
const lastToolResult = (messages: Anthropic.MessageParam[]): Record<string, unknown> => {
  const last = messages.at(-1);
  if (last?.role !== 'user' || !Array.isArray(last.content)) {
    throw new Error('esperava um tool_result no histórico');
  }
  const block = last.content.find(
    (b): b is Anthropic.ToolResultBlockParam =>
      typeof b === 'object' && b !== null && 'type' in b && b.type === 'tool_result',
  );
  if (!block || typeof block.content !== 'string') throw new Error('tool_result inesperado');
  return JSON.parse(block.content) as Record<string, unknown>;
};

const MOTIVO_VALUE = 'Solicitação via WhatsApp';

const createHappyPathClient = (
  phone: string,
  templateKey: string,
): AnthropicClient & { createMessage: ReturnType<typeof vi.fn> } => {
  let step = 0;
  const createMessage = vi.fn(async ({ messages }: { messages: Anthropic.MessageParam[] }) => {
    step++;
    if (step === 1) return toolUse('call-1', 'find_or_create_customer', { phone }) as unknown as AnthropicMessage;
    if (step === 2) {
      const { customerId } = lastToolResult(messages) as { customerId: string };
      return toolUse('call-2', 'open_process', { templateKey, customerId }) as unknown as AnthropicMessage;
    }
    if (step === 3) {
      const { processId } = lastToolResult(messages) as { processId: string };
      return toolUse('call-3', 'set_process_fields', {
        processId,
        values: { motivo: MOTIVO_VALUE },
      }) as unknown as AnthropicMessage;
    }
    return endTurn(
      'Prontinho! Abri seu processo e já registrei os dados. Posso ajudar em mais alguma coisa?',
    ) as unknown as AnthropicMessage;
  });
  return { createMessage };
};

const seedCustomerTemplate = async (tenant: string) =>
  FieldTemplate.create({
    Tenant: tenant,
    targetType: 'customer',
    key: 'cliente',
    name: 'Cliente',
    currentVersion: 1,
    archived: false,
  });

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

const seedChannel = async (tenant: string, phoneNumberId: string) =>
  Channel.create({
    Tenant: tenant,
    phoneNumberId,
    accessTokenEnc: { ciphertext: 'c', iv: 'i', authTag: 'a' },
    status: 'active',
  });

describe('golden set — happy path do Anel A (AIG-39, AIG-43)', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
    await Message.init();
    await Conversation.init();
  });

  afterEach(async () => {
    await Message.deleteMany({});
    await Conversation.deleteMany({});
    await Customer.deleteMany({});
    await Process.deleteMany({});
    await FieldTemplateVersion.deleteMany({});
    await FieldTemplate.deleteMany({});
    await Channel.deleteMany({});
  });

  afterAll(async () => {
    await disconnect();
  });

  // Cada `it()` roda o MESMO cenário do zero (tenant/canal/template próprios)
  // — não compartilha estado entre asserções — mas foca uma única
  // preocupação, para que uma falha aponte exatamente qual garantia quebrou
  // (sequência de tools, superfície fixa, ou efeito real no banco).
  const runHappyPathTurn = async () => {
    const tenant = randomId();
    const phoneNumberId = randomId();
    const from = randomPhone();
    const templateKey = 'orcamento';
    await seedCustomerTemplate(tenant);
    await seedChannel(tenant, phoneNumberId);
    await seedProcessTemplate(tenant, templateKey, ['novo', 'em_andamento', 'fechado']);
    const client = createHappyPathClient(from, templateKey);
    const input: IngestInput = {
      phoneNumberId,
      wamid: `wamid-happy-path-${randomId()}`,
      from,
      type: 'text',
      text: 'Quero abrir um orçamento, o motivo é: Solicitação via WhatsApp',
    };

    const result = await runTurn(client, input);
    return { tenant, from, templateKey, client, result };
  };

  it('calls find_or_create_customer→open_process→set_process_fields in order, with the right arguments (AIG-39 AC1)', async () => {
    const { from, templateKey, client, result } = await runHappyPathTurn();

    expect(result.outcome).toBe('sent');
    expectTool(client.createMessage, 'find_or_create_customer', { phone: from });
    expectTool(client.createMessage, 'open_process', { templateKey });
    expectTool(client.createMessage, 'set_process_fields', { values: { motivo: MOTIVO_VALUE } });
  });

  it('never offers nor calls any tool outside the fixed tool surface (AIG-39 AC1, 3 tools ainda inexistentes)', async () => {
    const { client } = await runHappyPathTurn();

    // catalog-orders/T14: search_products/get_order_status/create_order
    // passaram a existir de verdade (TOOL_DEFINITIONS) — não são mais um
    // exemplo válido de "tool fora da superfície". payments-asaas/T20
    // registrou issue_payment_link como a 8ª tool real (ela agora É
    // oferecida em toda chamada — correto, não uma regressão), então saiu
    // desta lista de "nunca deveria ser oferecida". Os 3 abaixo continuam
    // genuinamente inexistentes.
    expectNoTool(client.createMessage, 'cancel_order');
    expectNoTool(client.createMessage, 'apply_discount');
    expectNoTool(client.createMessage, 'schedule_callback');
  });

  it('persists the real side effects in MongoDB: a Customer and an open Process with the collected values', async () => {
    const { tenant, from } = await runHappyPathTurn();

    const customer = await Customer.findOne({ Tenant: tenant, phone: from }).lean();
    expect(customer).not.toBeNull();
    const process = await Process.findOne({ Tenant: tenant, customer: customer?._id }).lean();
    expect(process?.stage).toBe('novo');
    expect(process?.values).toEqual({ motivo: MOTIVO_VALUE });
  });
});
