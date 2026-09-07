import crypto from 'node:crypto';
import { Channel, type ChannelDocument, Conversation, Customer, Message, type MessageDocument } from '@crm/db';
import { createMetaClient, type MetaClient } from '../providers/metaClient.js';

export type OutboxConsumerDeps = {
  encKey: string;
  // Injetável (mesmo molde de T11/T12/T26) — produção usa createMetaClient
  // real, testes injetam um fake determinístico (nunca a rede real).
  createClient?: (channel: ChannelDocument, encKey: string) => MetaClient;
  // AIG-29: 3 tentativas, backoff 1s/3s/9s — configurável só para teste não
  // esperar segundos reais (mesmo padrão de turnLockPollMs/CeilingMs, T18).
  retryDelaysMs?: number[];
};

const DEFAULT_RETRY_DELAYS_MS = [1000, 3000, 9000];

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Claim atômico (mesmo padrão do turnLock, T3/T18, e do ADR-0007 que o
// inspira): dois consumidores concorrentes nunca reivindicam a mesma
// mensagem — findOneAndUpdate garante isso no próprio banco, não em memória.
export const claimQueuedMessage = async (holder: string): Promise<MessageDocument | null> => {
  return Message.findOneAndUpdate(
    { direction: 'out', status: 'queued' },
    { $set: { status: 'sending', claimedBy: holder, claimedAt: new Date() } },
    { sort: { createdAt: 1 }, returnDocument: 'after' },
  ).lean();
};

const isWithin24hWindow = (windowExpiresAt: Date | undefined): boolean =>
  !!windowExpiresAt && windowExpiresAt.getTime() > Date.now();

const markFailed = async (messageId: string, error: string): Promise<void> => {
  await Message.updateOne({ _id: messageId }, { $set: { status: 'failed', error } });
};

// AIG-28/ADR-0007: wamid gravado ANTES do status:'sent' — dois updates
// separados (nunca um único $set combinado) para a ordem ficar observável e
// provável por spy em teste.
const markSent = async (messageId: string, wamid: string): Promise<void> => {
  await Message.updateOne({ _id: messageId }, { $set: { wamid } });
  await Message.updateOne({ _id: messageId }, { $set: { status: 'sent' } });
};

type SendOutcome = { ok: true; wamid: string } | { ok: false; error: string };

const sendWithRetry = async (
  client: MetaClient,
  message: Pick<MessageDocument, 'templateName' | 'templateLanguage' | 'templateParams' | 'text'>,
  to: string,
  delaysMs: number[],
): Promise<SendOutcome> => {
  let lastError = 'Falha desconhecida ao enviar via Meta';
  const attempts = delaysMs.length + 1;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const result = message.templateName
        ? await client.sendTemplate(to, message.templateName, message.templateLanguage ?? '', message.templateParams)
        : await client.sendText(to, message.text ?? '');
      return { ok: true, wamid: result.wamid };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < delaysMs.length) await sleep(delaysMs[attempt]);
    }
  }

  return { ok: false, error: lastError };
};

// Um tick: reivindica NO MÁXIMO 1 mensagem da outbox e a processa até um
// status terminal (sent/failed) — 'empty' quando não há nada para reivindicar.
export const processNextOutboxMessage = async (
  deps: OutboxConsumerDeps,
  holder: string = crypto.randomUUID(),
): Promise<'claimed' | 'empty'> => {
  const message = await claimQueuedMessage(holder);
  if (!message) return 'empty';

  const [conversation, customer, channel] = await Promise.all([
    Conversation.findById(message.Conversation).lean(),
    Customer.findById(message.Customer).lean(),
    Channel.findById(message.Channel).lean(),
  ]);

  if (!conversation || !customer || !channel) {
    await markFailed(message._id.toString(), 'Canal, conversa ou cliente não encontrado para a mensagem');
    return 'claimed';
  }

  // AIG-27: janela de 24h só aceita template fora dela — texto livre fora da
  // janela nunca chama a Meta.
  if (!message.templateName && !isWithin24hWindow(conversation.windowExpiresAt)) {
    await markFailed(message._id.toString(), 'Janela de 24h expirada para mensagem de texto livre');
    return 'claimed';
  }

  const buildClient = deps.createClient ?? createMetaClient;
  const client = buildClient(channel, deps.encKey);
  const outcome = await sendWithRetry(client, message, customer.phone, deps.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS);

  if (outcome.ok) {
    await markSent(message._id.toString(), outcome.wamid);
  } else {
    await markFailed(message._id.toString(), outcome.error);
  }

  return 'claimed';
};

export type OutboxConsumerHandle = { stop: () => void };

// design.md: startOutboxConsumer(intervalMs=2000) — cadência de poll da
// outbox (ADR-0006, consistência de sistema).
export const startOutboxConsumer = (deps: OutboxConsumerDeps, intervalMs = 2000): OutboxConsumerHandle => {
  const handle = setInterval(() => {
    void processNextOutboxMessage(deps).catch((err) => {
      console.error(
        JSON.stringify({
          event: 'outbox_consumer.tick_failed',
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    });
  }, intervalMs);

  return { stop: () => clearInterval(handle) };
};
