import {
  Channel,
  type ChannelDocument,
  Conversation,
  type ConversationDocument,
  Customer,
  type CustomerDocument,
  claimTurnLock,
  FieldTemplate,
  Message,
  type MessageDocument,
  type MessageType,
  tenantScoped,
} from '@crm/db';
import type { WhisperClient, WhisperTranscription } from './providers/whisperClient.js';

// AIG-07/08/09/25/12/32 — mermaid do design.md: "ingest: dedup wamid, resolve
// Channel→Tenant, claim turnLock". `phoneNumberId` chega cru do payload do webhook
// (apps/ai-gateway, T25+) — a resolução de Channel/Tenant acontece AQUI, não antes
// (SPEC_DEVIATION do texto literal do design.md, que descrevia `runTurn` recebendo um
// `channel: ChannelDocument` já resolvido — a Done-when de T18/AIG-08 exige que a
// própria ingest devolva `{resolved:false}` quando o phoneNumberId não bate com nenhum
// Channel, o que só faz sentido se a resolução ocorrer dentro dela).
export type IngestInput = {
  phoneNumberId: string;
  wamid: string;
  from: string;
  type: MessageType;
  text?: string;
  mediaId?: string;
};

// P2 (T47, AIG-45): áudio baixado da Meta via fluxo de duas etapas
// (metaClient.getMediaUrl→downloadMedia, design.md) — injetável, mesmo
// molde de AnthropicClient/WhisperClient (T11/T12). `packages/ai-kit` NUNCA
// importa `apps/ai-gateway/src/providers/metaClient.ts` (packages são
// consumidos por apps, nunca o inverso) — só o TIPO vive aqui; a
// implementação REAL fica em apps/ai-gateway (webhook.router.ts), que
// injeta o downloader real ao chamar `runTurn`. Todo teste injeta um fake,
// nunca a rede real da Meta.
export type DownloadAudio = (
  channel: Pick<ChannelDocument, 'phoneNumberId' | 'accessTokenEnc'>,
  mediaId: string,
) => Promise<{ buffer: Buffer; mime: string }>;

export type IngestOptions = {
  turnLockPollMs?: number;
  turnLockCeilingMs?: number;
  // P2 (T47): ambos opcionais e injetados juntos — sem eles (ou com
  // input.type !== 'audio'), o comportamento é EXATAMENTE o do P1 (áudio
  // cai no fallback de tipo não suportado em guardInput, T19).
  downloadAudio?: DownloadAudio;
  whisperClient?: WhisperClient;
};

export type IngestResult =
  | { resolved: false }
  | {
      resolved: true;
      isDuplicate: boolean;
      channel: ChannelDocument;
      conversation: ConversationDocument;
      customer: CustomerDocument;
      message: MessageDocument;
      // P2 (T47): só populado quando input.type === 'audio' E downloadAudio+
      // whisperClient foram injetados — runTurn.ts usa isto para montar o
      // `transcribedText` que guardInput.ts (T47) trata como turno normal.
      audioTranscription?: WhisperTranscription;
    };

const DEFAULT_TURN_LOCK_POLL_MS = 200;
const DEFAULT_TURN_LOCK_CEILING_MS = 15000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const isDuplicateKeyError = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 11000;

// checkConversationMode: gate explícito entre guardInput e contextBuild
// (design.md) — quando true (mode:'human'), runTurn (T24) para logo após
// persistir a Message{in}; contextBuild/runLoop/guardOutput nunca rodam
// (AIG-12/32).
export const checkConversationMode = (conversation: Pick<ConversationDocument, 'mode'>): boolean =>
  conversation.mode === 'human';

// Toda Conversation/Message exige um Customer (schema de packages/db) — a
// primeira mensagem de um telefone precisa de um Customer mesmo antes de
// qualquer tool do modelo rodar. Mesma regra de reuso de find_or_create_customer
// (spec Assumptions: reusa o mais recentemente atualizado, cria só se nenhum
// existir) replicada aqui em escopo próprio — ingest não tem ToolContext (não é
// uma tool chamada pelo modelo), então não reusa tools/findOrCreateCustomer.ts.
const findOrCreateCustomerByPhone = async (tenantId: string, phone: string): Promise<CustomerDocument> => {
  const existing = await Customer.findOne(tenantScoped({ Tenant: tenantId, phone }))
    .sort({ updatedAt: -1 })
    .lean();
  if (existing) return existing;

  const template = await FieldTemplate.findOne(
    tenantScoped({ Tenant: tenantId, targetType: 'customer' as const }),
  ).lean();
  if (!template) throw new Error('Tenant sem template de cliente configurado');

  return Customer.create({
    Tenant: tenantId,
    name: phone,
    phone,
    template: template._id,
    templateVersion: template.currentVersion,
    values: {},
  });
};

// {Channel,Customer} é a chave de identidade de uma Conversation (spec.md Edge
// Cases / índice único do model) — primeira mensagem cria, as demais reusam.
// `findOneAndUpdate` com upsert é atômico: duas mensagens quase simultâneas do
// mesmo Customer nunca criam duas Conversation.
const findOrCreateConversation = async (
  tenantId: string,
  channelId: string,
  customerId: string,
): Promise<ConversationDocument> => {
  return Conversation.findOneAndUpdate(
    { Channel: channelId, Customer: customerId },
    { $setOnInsert: { Tenant: tenantId, Channel: channelId, Customer: customerId } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  ).lean();
};

// P2 (T47, AIG-45/47): baixa (Meta) e transcreve (Whisper) UM áudio, sem
// jamais lançar — qualquer falha (rede, chave revogada, Whisper
// indisponível) vira `{error}`, tratado por guardInput.ts (T47) exatamente
// como o fallback de tipo não suportado já existente (T19), nunca derruba o
// webhook. O binário (`buffer`) nunca sai desta função — só o `mime`
// (ponteiro) e o texto transcrito (ou o erro) retornam para `ingest`.
const transcribeAudio = async (
  channel: Pick<ChannelDocument, 'phoneNumberId' | 'accessTokenEnc'>,
  mediaId: string,
  downloadAudio: DownloadAudio,
  whisperClient: WhisperClient,
): Promise<{ mime?: string; transcription: WhisperTranscription }> => {
  try {
    const downloaded = await downloadAudio(channel, mediaId);
    const transcription = await whisperClient.transcribe(downloaded.buffer, downloaded.mime);
    return { mime: downloaded.mime, transcription };
  } catch (err) {
    return { transcription: { error: err instanceof Error ? err.message : 'Falha ao baixar áudio da Meta' } };
  }
};

export const ingest = async (input: IngestInput, opts: IngestOptions = {}): Promise<IngestResult> => {
  const channel = await Channel.findOne({ phoneNumberId: input.phoneNumberId }).lean();
  if (!channel) {
    console.log(JSON.stringify({ event: 'channel_not_resolved', phoneNumberId: input.phoneNumberId }));
    return { resolved: false };
  }

  const tenantId = channel.Tenant.toString();
  const channelId = channel._id.toString();
  const customer = await findOrCreateCustomerByPhone(tenantId, input.from);
  const conversation = await findOrCreateConversation(tenantId, channelId, customer._id.toString());

  // P2 (T47): SEMPRE antes de persistir a Message, para que o `mime`
  // resolvido (se algum) já entre no ponteiro `media` da própria criação —
  // mesmo padrão de `input.mediaId` abaixo, nunca uma 2ª escrita.
  let mediaMime: string | undefined;
  let audioTranscription: WhisperTranscription | undefined;
  if (input.type === 'audio' && input.mediaId && opts.downloadAudio && opts.whisperClient) {
    const result = await transcribeAudio(channel, input.mediaId, opts.downloadAudio, opts.whisperClient);
    mediaMime = result.mime;
    audioTranscription = result.transcription;
  }

  let message: MessageDocument;
  let isDuplicate = false;
  try {
    message = await Message.create({
      Tenant: tenantId,
      Conversation: conversation._id,
      Channel: channel._id,
      Customer: customer._id,
      direction: 'in',
      type: input.type,
      text: input.text,
      // AIG-48: só o ponteiro (mediaId/mime) é persistido — o binário do
      // áudio NUNCA passa por aqui nem por nenhum outro campo/collection.
      media: input.mediaId ? { mediaId: input.mediaId, mime: mediaMime } : undefined,
      wamid: input.wamid,
    });
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
    const existing = await Message.findOne({ wamid: input.wamid }).lean();
    if (!existing) throw err; // E11000 implica que já existe — não deveria acontecer
    isDuplicate = true;
    message = existing;
  }

  // Dedup por wamid (AIG-07): a 2ª chamada é no-op idempotente — nem a janela
  // de 24h, nem o turnLock são tocados de novo.
  if (isDuplicate) {
    console.log(JSON.stringify({ event: 'wamid_dedup_hit', wamid: input.wamid }));
    return { resolved: true, isDuplicate, channel, conversation, customer, message, audioTranscription };
  }

  const now = new Date();
  await Conversation.updateOne(
    { _id: conversation._id },
    {
      $set: {
        lastInboundAt: now,
        windowExpiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        lastActivityAt: now,
      },
    },
  );

  // Serialização de turno (AIG-25, ADR-0007-like): espera curta com poll pelo
  // turnLock liberar; estoura o teto → processa mesmo assim (best-effort, ver
  // design.md Error Handling Strategy) — nunca lança.
  const pollMs = opts.turnLockPollMs ?? DEFAULT_TURN_LOCK_POLL_MS;
  const ceilingMs = opts.turnLockCeilingMs ?? DEFAULT_TURN_LOCK_CEILING_MS;
  const startedAt = Date.now();
  let claimed = await claimTurnLock(conversation._id.toString(), message._id.toString());
  // AIG-44: loga UMA vez por chamada de ingest quando ela precisou esperar
  // (lock ocupado no 1º attempt) — nunca a cada tick do poll, para não
  // inundar o log num teto de espera longo.
  if (!claimed) {
    console.log(JSON.stringify({ event: 'turn_lock_occupied', conversationId: conversation._id.toString() }));
  }
  while (!claimed && Date.now() - startedAt < ceilingMs) {
    await sleep(pollMs);
    claimed = await claimTurnLock(conversation._id.toString(), message._id.toString());
  }
  if (!claimed) {
    console.log(JSON.stringify({ event: 'turn_lock_ceiling_exceeded', conversationId: conversation._id.toString() }));
  }

  const finalConversation = claimed ?? (await Conversation.findById(conversation._id).lean()) ?? conversation;

  return {
    resolved: true,
    isDuplicate,
    channel,
    conversation: finalConversation,
    customer,
    message,
    audioTranscription,
  };
};
