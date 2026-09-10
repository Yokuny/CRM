import crypto from 'node:crypto';
import type { AnthropicClient, AnthropicMessage, AsaasClient, IngestInput } from '@crm/ai-kit';
import { runTurn } from '@crm/ai-kit';
import {
  AsaasIntegration,
  Channel,
  Conversation,
  Customer,
  connect,
  disconnect,
  FieldTemplate,
  Message,
  Order,
  Payment,
  Product,
} from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Golden set — issue_payment_link nunca chamado/nunca bem-sucedido antes de
// `confirmed` (spec.md P1 "Cliente paga um pedido confirmado via PIX"/AC2/AC3,
// AD-009). Mesma estrutura EXATA de createOrderGuardrails.int.test.ts (fake
// client/seed/runTurn/asserção) — duplicação deliberada e mínima (evals/ não
// importa fixtures de packages/ai-kit/src/*.test.ts, que nem é publicado pelo
// barrel).
const randomId = (): string => crypto.randomBytes(12).toString('hex');
const randomPhone = (): string => `119${crypto.randomInt(10000000, 99999999)}`;

type FakeContent = { type: string; text?: string; id?: string; name?: string; input?: unknown };
type FakeResponse = { content: FakeContent[]; stop_reason: string };

const endTurn = (text: string): FakeResponse => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn' });

const createFakeClient = (responses: FakeResponse[]): AnthropicClient & { createMessage: ReturnType<typeof vi.fn> } => {
  let call = 0;
  const createMessage = vi.fn(async () => {
    const res = responses[Math.min(call, responses.length - 1)];
    call++;
    return res as unknown as AnthropicMessage;
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

const seedChannel = async (tenant: string, phoneNumberId: string) =>
  Channel.create({
    Tenant: tenant,
    phoneNumberId,
    accessTokenEnc: { ciphertext: 'c', iv: 'i', authTag: 'a' },
    status: 'active',
  });

const fakeAsaasClient = (): { [K in keyof AsaasClient]: ReturnType<typeof vi.fn> } => ({
  ensureCustomer: vi.fn(),
  createPixCharge: vi.fn(),
  getCharge: vi.fn(),
});

const issuePaymentLinkToolUse = (id: string, input: unknown): FakeContent => ({
  type: 'tool_use',
  id,
  name: 'issue_payment_link',
  input,
});

// Mesmo padrão de duas chamadas de wamidDedup.int.test.ts/tenantIsolation.int.test.ts:
// a 1ª runTurn (texto inócuo, sem tool_use) só bootstrapa Channel→Conversation→
// Customer via ingest() — o único jeito de obter um Conversation/Customer real
// pra semear o Order diretamente, sem inventar um fluxo de create_order aqui.
const bootstrapConversation = async (tenant: string, phoneNumberId: string, from: string) => {
  const bootstrapClient = createFakeClient([endTurn('Olá! Como posso ajudar?')]);
  const bootstrapResult = await runTurn(bootstrapClient, {
    phoneNumberId,
    wamid: `wamid-bootstrap-${randomId()}`,
    from,
    type: 'text',
    text: 'oi',
  } satisfies IngestInput);
  expect(bootstrapResult.outcome).toBe('sent');
  const conversation = await Conversation.findOne({ Tenant: tenant }).lean();
  if (!conversation) throw new Error('bootstrap não criou a Conversation esperada');
  return conversation;
};

describe('golden set — issue_payment_link nunca antes de confirmed (spec.md P1 "Cliente paga um pedido confirmado via PIX", AD-009)', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
    await Message.init();
    await Conversation.init();
    await AsaasIntegration.init();
    await Payment.init();
  });

  afterEach(async () => {
    await Message.deleteMany({});
    await Conversation.deleteMany({});
    await Customer.deleteMany({});
    await Product.deleteMany({});
    await Order.deleteMany({});
    await Payment.deleteMany({});
    await AsaasIntegration.deleteMany({});
    await FieldTemplate.deleteMany({});
    await Channel.deleteMany({});
  });

  afterAll(async () => {
    await disconnect();
  });

  it('never creates a Payment nor calls the AsaasClient for a pending_approval Order — structural gate, not a prompt-level check (PAY-02, spec.md AC2)', async () => {
    const tenant = randomId();
    const phoneNumberId = randomId();
    const from = randomPhone();
    await seedCustomerTemplate(tenant);
    await seedChannel(tenant, phoneNumberId);
    const conversation = await bootstrapConversation(tenant, phoneNumberId, from);
    const product = await Product.create({ Tenant: tenant, name: 'Caneca', price: 5000, stock: 5, active: true });
    const order = await Order.create({
      Tenant: tenant,
      conversation: conversation._id,
      customer: conversation.Customer,
      items: [{ product: product._id, name: product.name, unitPrice: product.price, quantity: 1 }],
      totalPrice: product.price,
      status: 'pending_approval',
      idempotencyKey: randomId(),
      customerConfirmed: false,
      operatorApproved: false,
    });
    const asaasClient = fakeAsaasClient();

    const client = createFakeClient([
      { content: [issuePaymentLinkToolUse('t1', { orderId: order._id.toString() })], stop_reason: 'tool_use' },
      endTurn('Seu pedido ainda não foi confirmado, então ainda não consigo gerar o pagamento.'),
    ]);
    const result = await runTurn(
      client,
      {
        phoneNumberId,
        wamid: `wamid-pay-pending-${randomId()}`,
        from,
        type: 'text',
        text: 'quero pagar meu pedido',
      } satisfies IngestInput,
      { asaasClient: asaasClient as unknown as AsaasClient },
    );

    expect(result.outcome).toBe('sent');
    expect(await Payment.countDocuments({})).toBe(0);
    expect(asaasClient.createPixCharge).not.toHaveBeenCalled();
  });

  it('creates a Payment via the injected AsaasClient for a confirmed Order and relays the real totalPrice un-redacted (PAY-01/PAY-03, spec.md AC1)', async () => {
    const tenant = randomId();
    const phoneNumberId = randomId();
    const from = randomPhone();
    await seedCustomerTemplate(tenant);
    await seedChannel(tenant, phoneNumberId);
    const conversation = await bootstrapConversation(tenant, phoneNumberId, from);
    const product = await Product.create({ Tenant: tenant, name: 'Caneca', price: 5000, stock: 5, active: true });
    const order = await Order.create({
      Tenant: tenant,
      conversation: conversation._id,
      customer: conversation.Customer,
      items: [{ product: product._id, name: product.name, unitPrice: product.price, quantity: 1 }],
      totalPrice: product.price,
      status: 'confirmed',
      idempotencyKey: randomId(),
      customerConfirmed: true,
      operatorApproved: true,
    });
    // Sem isto, issuePaymentLink.ts's próprio gate (PAY-04) rejeitaria a
    // chamada por falta de integração ativa — não é o que este caso prova.
    await AsaasIntegration.create({
      Tenant: tenant,
      apiKeyEnc: { ciphertext: 'c', iv: 'i', authTag: 'a' },
      environment: 'sandbox',
      webhookToken: randomId(),
      webhookAuthTokenHash: 'hash-fixo-de-teste',
      status: 'active',
    });
    const asaasClient = fakeAsaasClient();
    asaasClient.ensureCustomer.mockResolvedValueOnce({ asaasCustomerId: 'cus_teste_1' });
    asaasClient.createPixCharge.mockResolvedValueOnce({
      asaasChargeId: 'ch_123',
      pixPayload: '00020126...',
      pixEncodedImage: 'base64...',
    });

    const client = createFakeClient([
      { content: [issuePaymentLinkToolUse('t1', { orderId: order._id.toString() })], stop_reason: 'tool_use' },
      endTurn('Show! Aqui está o PIX para pagamento: R$50,00 — copia e cola no seu banco.'),
    ]);
    const result = await runTurn(
      client,
      {
        phoneNumberId,
        wamid: `wamid-pay-confirmed-${randomId()}`,
        from,
        type: 'text',
        text: 'quero pagar meu pedido',
      } satisfies IngestInput,
      { asaasClient: asaasClient as unknown as AsaasClient },
    );

    expect(result.outcome).toBe('sent');
    if (result.outcome !== 'sent') throw new Error('unreachable');
    expect(await Payment.countDocuments({ order: order._id })).toBe(1);
    const payment = await Payment.findOne({ order: order._id }).lean();
    expect(payment?.status).toBe('pending');
    expect(payment?.value).toBe(5000);
    // Preço real (lastro no tool_result de issue_payment_link deste turno,
    // totalPrice já no allow-list de guardOutput.ts) passa SEM redação.
    expect(result.reply).toContain('R$50,00');
    expect(result.reply).not.toContain('[removido]');
  });
});
