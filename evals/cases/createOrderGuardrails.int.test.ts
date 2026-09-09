import crypto from 'node:crypto';
import type { AnthropicClient, AnthropicMessage, IngestInput } from '@crm/ai-kit';
import { runTurn } from '@crm/ai-kit';
import {
  Channel,
  Conversation,
  Customer,
  connect,
  disconnect,
  FieldTemplate,
  Message,
  Order,
  Product,
  setOperatorApproved,
} from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { expectNoLeak } from '../runner/expectNoLeak.js';

// Golden set — create_order + guard de preço (spec.md P1 "Cliente monta e
// confirma um pedido" + P1 "guard.output"/CAT-25/26/27, AD-009). Generaliza
// pra create_order o mesmo espírito já provado para issue_payment_link em
// promptInjection.int.test.ts: a transição pending_approval→confirmed exige
// as DUAS condições (nunca uma só), e a resposta final ao cliente nunca cita
// um preço sem lastro em tool_result deste turno — as duas garantias
// centrais do Anel B, verificadas contra o harness real (runTurn + Mongo).
// Duplicação deliberada e mínima dos helpers de seed/fake client já usados
// em happyPath.int.test.ts/promptInjection.int.test.ts (evals/ não importa
// fixtures de packages/ai-kit/src/*.test.ts, que nem é publicado pelo
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

const createOrderToolUse = (id: string, input: unknown): FakeContent => ({
  type: 'tool_use',
  id,
  name: 'create_order',
  input,
});

describe('golden set — create_order + guard de preço (spec.md P1 "guard.output", AD-009)', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
    await Message.init();
    await Conversation.init();
  });

  afterEach(async () => {
    await Message.deleteMany({});
    await Conversation.deleteMany({});
    await Customer.deleteMany({});
    await Product.deleteMany({});
    await Order.deleteMany({});
    await FieldTemplate.deleteMany({});
    await Channel.deleteMany({});
  });

  afterAll(async () => {
    await disconnect();
  });

  it('never transitions an Order to confirmed with only ONE of the two conditions — only operator approval + customer confirmation together confirms it (spec.md P1 "Cliente monta e confirma um pedido"/AC1/AC3, AD-009)', async () => {
    const tenant = randomId();
    const phoneNumberId = randomId();
    const from = randomPhone();
    const idempotencyKey = `idem-${randomId()}`;
    await seedCustomerTemplate(tenant);
    await seedChannel(tenant, phoneNumberId);
    const product = await Product.create({ Tenant: tenant, name: 'Caneca', price: 5000, stock: 5, active: true });

    // 1ª chamada (Anel B, sem customerConfirmed): cria o Order pending_approval.
    const firstCallClient = createFakeClient([
      {
        content: [
          createOrderToolUse('t1', { items: [{ productId: product._id.toString(), quantity: 1 }], idempotencyKey }),
        ],
        stop_reason: 'tool_use',
      },
      endTurn('Perfeito! Seu pedido de R$50,00 ficou pendente de aprovação. Posso confirmar?'),
    ]);
    const firstResult = await runTurn(firstCallClient, {
      phoneNumberId,
      wamid: `wamid-create-${randomId()}`,
      from,
      type: 'text',
      text: 'quero comprar uma caneca',
    } satisfies IngestInput);
    expect(firstResult.outcome).toBe('sent');
    const afterCreate = await Order.findOne({ idempotencyKey }).lean();
    expect(afterCreate?.status).toBe('pending_approval');
    expect(afterCreate?.customerConfirmed).toBe(false);
    expect(afterCreate?.operatorApproved).toBe(false);

    // Só a aprovação do operador (customerConfirmed AINDA false) — a
    // transição compartilhada (packages/db/src/orderTransitions.ts, AD-033)
    // NUNCA confirma com uma condição só.
    const afterApprovalOnly = await setOperatorApproved(tenant, afterCreate?._id.toString() as string, randomId());
    expect((afterApprovalOnly as { status: string }).status).toBe('pending_approval');
    expect(await Order.countDocuments({ idempotencyKey })).toBe(1);

    // 2ª chamada (Anel B, customerConfirmed:true, MESMOS items/idempotencyKey):
    // agora as duas condições se completam — só ENTÃO o Order confirma.
    const secondCallClient = createFakeClient([
      {
        content: [
          createOrderToolUse('t2', {
            items: [{ productId: product._id.toString(), quantity: 1 }],
            idempotencyKey,
            customerConfirmed: true,
          }),
        ],
        stop_reason: 'tool_use',
      },
      endTurn('Show, pedido confirmado! Total R$50,00.'),
    ]);
    const secondResult = await runTurn(secondCallClient, {
      phoneNumberId,
      wamid: `wamid-confirm-${randomId()}`,
      from,
      type: 'text',
      text: 'sim, confirmo!',
    } satisfies IngestInput);

    expect(secondResult.outcome).toBe('sent');
    const afterBoth = await Order.findOne({ idempotencyKey }).lean();
    expect(afterBoth?.status).toBe('confirmed');
    expect(afterBoth?.customerConfirmed).toBe(true);
    expect(afterBoth?.operatorApproved).toBe(true);
    // Nunca um segundo Order — a mesma idempotencyKey sempre aponta pro
    // MESMO documento, do início ao fim do fluxo de duas chamadas.
    expect(await Order.countDocuments({ idempotencyKey })).toBe(1);
  });

  it('never lets the customer-facing reply cite a money value that isn\'t backed by this turn\'s tool results, even when create_order ran in the same turn (spec.md P1 "guard.output"/AC1/AC2, CAT-25/26/27)', async () => {
    const tenant = randomId();
    const phoneNumberId = randomId();
    const from = randomPhone();
    const idempotencyKey = `idem-${randomId()}`;
    await seedCustomerTemplate(tenant);
    await seedChannel(tenant, phoneNumberId);
    const product = await Product.create({ Tenant: tenant, name: 'Caneca', price: 5000, stock: 5, active: true });
    // A resposta simulada do modelo cita o preço REAL do totalPrice deste
    // turno (R$50,00, lastro no tool_result de create_order) E um valor
    // FABRICADO sem lastro nenhum (R$15,00 de "taxa extra") — exatamente o
    // cenário que guard.output precisa distinguir.
    const client = createFakeClient([
      {
        content: [
          createOrderToolUse('t1', { items: [{ productId: product._id.toString(), quantity: 1 }], idempotencyKey }),
        ],
        stop_reason: 'tool_use',
      },
      endTurn('Seu pedido de R$50,00 foi registrado, mas cobra uma taxa extra de R$15,00 no ato.'),
    ]);

    const result = await runTurn(client, {
      phoneNumberId,
      wamid: `wamid-guard-${randomId()}`,
      from,
      type: 'text',
      text: 'quero comprar uma caneca',
    } satisfies IngestInput);

    expect(result.outcome).toBe('sent');
    if (result.outcome !== 'sent') throw new Error('unreachable');
    // O Order foi mesmo criado nesta rodada (a garantia de preço vale JUNTO
    // com o fluxo de pedido real, não isolada dele):
    expect(await Order.countDocuments({ idempotencyKey })).toBe(1);
    // O preço REAL (lastro no tool_result deste turno) passa sem alteração:
    expect(result.reply).toContain('R$50,00');
    // O preço FABRICADO (sem nenhum tool_result correspondente) nunca chega
    // ao cliente — mesma garantia de expectNoLeak, generalizada de "dado de
    // outro tenant" pra "preço sem lastro":
    expectNoLeak(result.reply, 'R$15,00');
    expect(result.reply).toContain('[removido]');
  });
});
