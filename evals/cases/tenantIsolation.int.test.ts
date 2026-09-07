import crypto from 'node:crypto';
import type { AnthropicClient, AnthropicMessage, IngestInput } from '@crm/ai-kit';
import { runTurn } from '@crm/ai-kit';
import { Channel, Conversation, Customer, connect, disconnect, FieldTemplate, Message, Process } from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { expectNoLeak } from '../runner/expectNoLeak.js';

// Golden set — isolamento entre tenants (AIG-39, AIG-41): 2 tenants
// espelhados (mesmo formato de Customer/Channel) com conversas rodando EM
// PARALELO (Promise.all) via runTurn real — prova que nenhuma tool,
// Conversation ou resposta final cruza dado entre eles, mesmo sob execução
// concorrente. Duplicação deliberada e mínima dos helpers de seed/fake client
// já usados em happyPath.int.test.ts (evals/ não importa fixtures de
// packages/ai-kit/src/*.test.ts, que nem é publicado pelo barrel).
const randomId = (): string => crypto.randomBytes(12).toString('hex');
const randomPhone = (): string => `119${crypto.randomInt(10000000, 99999999)}`;

const endTurn = (text: string): { content: Array<{ type: string; text: string }>; stop_reason: string } => ({
  content: [{ type: 'text', text }],
  stop_reason: 'end_turn',
});

const createSimpleReplyClient = (reply: string): AnthropicClient & { createMessage: ReturnType<typeof vi.fn> } => {
  const createMessage = vi.fn(async () => endTurn(reply) as unknown as AnthropicMessage);
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

const seedChannel = async (tenant: string, phoneNumberId: string) =>
  Channel.create({
    Tenant: tenant,
    phoneNumberId,
    accessTokenEnc: { ciphertext: 'c', iv: 'i', authTag: 'a' },
    status: 'active',
  });

describe('golden set — isolamento entre tenants (AIG-39, AIG-41)', () => {
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
    await FieldTemplate.deleteMany({});
    await Channel.deleteMany({});
  });

  afterAll(async () => {
    await disconnect();
  });

  // Cada tenant tem seu Customer pré-existente com o MESMO telefone/nome do
  // outro (mirror de conversationRouter/tenant-isolation.int.test.ts) — a
  // única diferença observável entre os dois mundos é o Tenant.
  const setupMirroredTenant = async (tenantSecretName: string) => {
    const tenant = randomId();
    const phoneNumberId = randomId();
    const from = randomPhone();
    const template = await seedCustomerTemplate(tenant);
    await seedChannel(tenant, phoneNumberId);
    const customer = await Customer.create({
      Tenant: tenant,
      name: tenantSecretName,
      phone: from,
      template: template._id,
      templateVersion: 1,
      values: {},
    });
    return { tenant, phoneNumberId, from, customer };
  };

  it("runs two mirrored conversations in parallel without either final reply ever containing the other tenant's Customer id", async () => {
    const tenantA = await setupMirroredTenant('Cliente Sigiloso A');
    const tenantB = await setupMirroredTenant('Cliente Sigiloso B');
    const clientA = createSimpleReplyClient('Olá! Como posso ajudar você hoje?');
    const clientB = createSimpleReplyClient('Oi! Em que posso ajudar?');

    const [resultA, resultB] = await Promise.all([
      runTurn(clientA, {
        phoneNumberId: tenantA.phoneNumberId,
        wamid: `wamid-a-${randomId()}`,
        from: tenantA.from,
        type: 'text',
        text: 'oi, tudo bem?',
      } satisfies IngestInput),
      runTurn(clientB, {
        phoneNumberId: tenantB.phoneNumberId,
        wamid: `wamid-b-${randomId()}`,
        from: tenantB.from,
        type: 'text',
        text: 'oi, tudo bem?',
      } satisfies IngestInput),
    ]);

    expect(resultA.outcome).toBe('sent');
    expect(resultB.outcome).toBe('sent');
    if (resultA.outcome !== 'sent' || resultB.outcome !== 'sent') throw new Error('unreachable');
    expectNoLeak(resultA.reply, tenantB.customer._id.toString());
    expectNoLeak(resultB.reply, tenantA.customer._id.toString());
  });

  it("keeps each tenant's Conversation/Customer count scoped to its own Tenant after parallel runs", async () => {
    const tenantA = await setupMirroredTenant('Cliente Sigiloso A');
    const tenantB = await setupMirroredTenant('Cliente Sigiloso B');
    const clientA = createSimpleReplyClient('Olá!');
    const clientB = createSimpleReplyClient('Oi!');

    await Promise.all([
      runTurn(clientA, {
        phoneNumberId: tenantA.phoneNumberId,
        wamid: `wamid-a-${randomId()}`,
        from: tenantA.from,
        type: 'text',
        text: 'mensagem do tenant A',
      }),
      runTurn(clientB, {
        phoneNumberId: tenantB.phoneNumberId,
        wamid: `wamid-b-${randomId()}`,
        from: tenantB.from,
        type: 'text',
        text: 'mensagem do tenant B',
      }),
    ]);

    expect(await Conversation.countDocuments({ Tenant: tenantA.tenant })).toBe(1);
    expect(await Conversation.countDocuments({ Tenant: tenantB.tenant })).toBe(1);
    expect(await Customer.countDocuments({ Tenant: tenantA.tenant })).toBe(1);
    expect(await Customer.countDocuments({ Tenant: tenantB.tenant })).toBe(1);
    // Nenhuma Conversation do tenant A referencia o Customer/Channel de B, e
    // vice-versa — cruzamento de FK entre tenants nunca acontece.
    const conversationA = await Conversation.findOne({ Tenant: tenantA.tenant }).lean();
    const conversationB = await Conversation.findOne({ Tenant: tenantB.tenant }).lean();
    expect(conversationA?.Customer.toString()).toBe(tenantA.customer._id.toString());
    expect(conversationB?.Customer.toString()).toBe(tenantB.customer._id.toString());
  });
});
