import crypto from 'node:crypto';
import type { AnthropicClient, AnthropicMessage, IngestInput } from '@crm/ai-kit';
import { runTurn } from '@crm/ai-kit';
import { Channel, Conversation, Customer, claimTurnLock, connect, disconnect, FieldTemplate, Message } from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Golden set — dedup de wamid via harness real (AIG-42): o mesmo payload de
// webhook processado 2x contra runTurn REAL (MongoMemoryServer) produz
// exatamente 1 Message — a 2ª chamada é um no-op idempotente que nunca roda
// o loop do modelo de novo. Mesma asserção de ingest.int.test.ts/
// runTurn.int.test.ts (packages/ai-kit), agora no contexto do golden set
// (duplicação deliberada e mínima — evals/ não importa fixtures desses
// arquivos, que nem são publicados pelo barrel).
const randomId = (): string => crypto.randomBytes(12).toString('hex');
const randomPhone = (): string => `119${crypto.randomInt(10000000, 99999999)}`;

const endTurn = (text: string): { content: Array<{ type: string; text: string }>; stop_reason: string } => ({
  content: [{ type: 'text', text }],
  stop_reason: 'end_turn',
});

const createFakeClient = (reply: string): AnthropicClient & { createMessage: ReturnType<typeof vi.fn> } => {
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

describe('golden set — dedup de wamid (AIG-42)', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
    await Message.init();
    await Conversation.init();
  });

  afterEach(async () => {
    await Message.deleteMany({});
    await Conversation.deleteMany({});
    await Customer.deleteMany({});
    await FieldTemplate.deleteMany({});
    await Channel.deleteMany({});
  });

  afterAll(async () => {
    await disconnect();
  });

  it('the same wamid delivered twice against runTurn real persists exactly 1 Message, and the model loop only runs once', async () => {
    const tenant = randomId();
    const phoneNumberId = randomId();
    const from = randomPhone();
    await seedCustomerTemplate(tenant);
    await seedChannel(tenant, phoneNumberId);
    const client = createFakeClient('Olá! Como posso ajudar?');
    const wamid = `wamid-dedup-${randomId()}`;
    const input: IngestInput = { phoneNumberId, wamid, from, type: 'text', text: 'oi' };

    const first = await runTurn(client, input);
    const second = await runTurn(client, input);

    expect(first.outcome).toBe('sent');
    expect(second).toEqual({ outcome: 'duplicate' });
    expect(await Message.countDocuments({ wamid })).toBe(1);
    // O loop do modelo (packages/ai-kit/src/loop.ts) só é acionado na 1ª
    // chamada — a 2ª nem chega perto de contextBuild/runLoop.
    expect(client.createMessage).toHaveBeenCalledTimes(1);
  });

  it('the 2nd delivery of the same wamid never creates a 2nd Conversation nor re-claims the turnLock', async () => {
    const tenant = randomId();
    const phoneNumberId = randomId();
    const from = randomPhone();
    await seedCustomerTemplate(tenant);
    await seedChannel(tenant, phoneNumberId);
    const client = createFakeClient('resposta');
    const wamid = `wamid-dedup-lock-${randomId()}`;
    const input: IngestInput = { phoneNumberId, wamid, from, type: 'text', text: 'oi de novo' };

    await runTurn(client, input);
    await runTurn(client, input);

    expect(await Conversation.countDocuments({ Tenant: tenant })).toBe(1);
    // O turnLock foi liberado ao final do 1º turno (dispatch, T23) — a 2ª
    // entrega (no-op) nunca o reivindica de novo, então ele continua livre
    // para o PRÓXIMO turno real reivindicar.
    const conversation = await Conversation.findOne({ Tenant: tenant }).lean();
    expect(conversation?.turnLock).toBeNull();
    expect(await claimTurnLock(conversation?._id.toString() as string, 'next-turn')).not.toBeNull();
  });
});
