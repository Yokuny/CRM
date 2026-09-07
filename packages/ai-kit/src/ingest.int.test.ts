import crypto from 'node:crypto';
import {
  Channel,
  Conversation,
  Customer,
  claimTurnLock,
  connect,
  disconnect,
  FieldTemplate,
  Message,
  releaseTurnLock,
} from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { checkConversationMode, type DownloadAudio, ingest } from './ingest.js';
import type { WhisperClient, WhisperTranscription } from './providers/whisperClient.js';

// Sem `mongoose` aqui (AD-010/boundary) — mesmo padrão dos tool executors
// (T14-T17).
const randomId = (): string => crypto.randomBytes(12).toString('hex');
const randomPhone = (): string => `119${crypto.randomInt(10000000, 99999999)}`;

const seedCustomerTemplate = async (tenant: string) => {
  return FieldTemplate.create({
    Tenant: tenant,
    targetType: 'customer',
    key: 'cliente',
    name: 'Cliente',
    currentVersion: 1,
    archived: false,
  });
};

const seedChannel = async (tenant: string, phoneNumberId: string) => {
  return Channel.create({
    Tenant: tenant,
    phoneNumberId,
    accessTokenEnc: { ciphertext: 'c', iv: 'i', authTag: 'a' },
    status: 'active',
  });
};

// P2 (T47) — fakes determinísticos, nunca a rede real da Meta/OpenAI (mesmo
// molde de createFakeClient em runTurn.int.test.ts).
const createFakeDownloadAudio = (buffer: Buffer, mime: string) =>
  vi.fn(async (..._args: Parameters<DownloadAudio>) => ({ buffer, mime }));

const createFakeWhisperClient = (
  result: WhisperTranscription,
): WhisperClient & { transcribe: ReturnType<typeof vi.fn> } => ({
  transcribe: vi.fn(async (..._args: Parameters<WhisperClient['transcribe']>) => result),
});

describe('ingest (AIG-07/08/09/25/12/32)', () => {
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

  it('resolves Channel→Tenant, creates Customer+Conversation+Message{in} for a fresh phone, and claims the turnLock', async () => {
    const tenant = randomId();
    const phoneNumberId = randomId();
    const from = randomPhone();
    await seedCustomerTemplate(tenant);
    const channel = await seedChannel(tenant, phoneNumberId);

    const result = await ingest({ phoneNumberId, wamid: 'wamid-1', from, type: 'text', text: 'oi' });

    expect(result.resolved).toBe(true);
    if (!result.resolved) throw new Error('unreachable');
    expect(result.isDuplicate).toBe(false);
    expect(result.channel._id.toString()).toBe(channel._id.toString());
    expect(result.customer.phone).toBe(from);
    expect(result.message.text).toBe('oi');
    expect(result.message.wamid).toBe('wamid-1');
    expect(result.conversation.turnLock).toEqual(expect.objectContaining({ holder: result.message._id.toString() }));
    expect(await Customer.countDocuments({ Tenant: tenant })).toBe(1);
  });

  it('returns {resolved:false} and creates nothing for a phoneNumberId with no matching Channel', async () => {
    const result = await ingest({ phoneNumberId: 'unknown', wamid: 'wamid-x', from: randomPhone(), type: 'text' });

    expect(result).toEqual({ resolved: false });
    expect(await Message.countDocuments({})).toBe(0);
    expect(await Conversation.countDocuments({})).toBe(0);
  });

  it('the same wamid called twice persists exactly 1 Message — the 2nd call reports isDuplicate:true', async () => {
    const tenant = randomId();
    const phoneNumberId = randomId();
    const from = randomPhone();
    await seedCustomerTemplate(tenant);
    await seedChannel(tenant, phoneNumberId);

    const first = await ingest({ phoneNumberId, wamid: 'wamid-dup', from, type: 'text', text: 'oi' });
    const second = await ingest({ phoneNumberId, wamid: 'wamid-dup', from, type: 'text', text: 'oi' });

    expect(first.resolved && first.isDuplicate).toBe(false);
    expect(second.resolved && second.isDuplicate).toBe(true);
    expect(await Message.countDocuments({ wamid: 'wamid-dup' })).toBe(1);
  });

  it('reuses the same Conversation for a 2nd message from the same Customer (different wamid)', async () => {
    const tenant = randomId();
    const phoneNumberId = randomId();
    const from = randomPhone();
    await seedCustomerTemplate(tenant);
    await seedChannel(tenant, phoneNumberId);

    const first = await ingest(
      { phoneNumberId, wamid: 'wamid-a', from, type: 'text', text: 'oi' },
      { turnLockPollMs: 10, turnLockCeilingMs: 30 },
    );
    const second = await ingest(
      { phoneNumberId, wamid: 'wamid-b', from, type: 'text', text: 'de novo' },
      { turnLockPollMs: 10, turnLockCeilingMs: 30 },
    );

    if (!first.resolved || !second.resolved) throw new Error('unreachable');
    expect(second.conversation._id.toString()).toBe(first.conversation._id.toString());
    expect(await Conversation.countDocuments({})).toBe(1);
  });

  it('waits with poll for an already-claimed turnLock, then claims it once released', async () => {
    const tenant = randomId();
    const phoneNumberId = randomId();
    const from = randomPhone();
    await seedCustomerTemplate(tenant);
    await seedChannel(tenant, phoneNumberId);
    const first = await ingest({ phoneNumberId, wamid: 'wamid-lock-1', from, type: 'text', text: 'oi' });
    if (!first.resolved) throw new Error('unreachable');
    // turnLock segue reivindicado por `first` (ingest nunca libera — persist/dispatch, T23, faz isso).
    expect(first.conversation.turnLock).not.toBeNull();

    setTimeout(() => {
      void releaseTurnLock(first.conversation._id.toString());
    }, 30);

    const second = await ingest(
      { phoneNumberId, wamid: 'wamid-lock-2', from, type: 'text', text: 'segunda' },
      { turnLockPollMs: 10, turnLockCeilingMs: 2000 },
    );

    if (!second.resolved) throw new Error('unreachable');
    expect(second.conversation.turnLock).toEqual(expect.objectContaining({ holder: second.message._id.toString() }));
  });

  it('proceeds anyway (no throw) once the turnLock poll ceiling is exceeded, without ever claiming the lock', async () => {
    const tenant = randomId();
    const phoneNumberId = randomId();
    const from = randomPhone();
    await seedCustomerTemplate(tenant);
    await seedChannel(tenant, phoneNumberId);
    const first = await ingest({ phoneNumberId, wamid: 'wamid-ceil-1', from, type: 'text', text: 'oi' });
    if (!first.resolved) throw new Error('unreachable');
    const holderBefore = first.conversation.turnLock?.holder;

    const second = await ingest(
      { phoneNumberId, wamid: 'wamid-ceil-2', from, type: 'text', text: 'segunda' },
      { turnLockPollMs: 10, turnLockCeilingMs: 30 },
    );

    expect(second.resolved).toBe(true);
    if (!second.resolved) throw new Error('unreachable');
    // Nunca reivindicado pela 2ª ingest — o holder continua sendo o da 1ª mensagem.
    expect(second.conversation.turnLock?.holder).toBe(holderBefore);
  });

  it('claimTurnLock never lets two concurrent claims over the same Conversation both succeed', async () => {
    const tenant = randomId();
    const channel = await seedChannel(tenant, randomId());
    const conversation = await Conversation.create({ Tenant: tenant, Channel: channel._id, Customer: randomId() });

    const [a, b] = await Promise.all([
      claimTurnLock(conversation._id.toString(), 'req-a'),
      claimTurnLock(conversation._id.toString(), 'req-b'),
    ]);

    const claimedCount = [a, b].filter((r) => r !== null).length;
    expect(claimedCount).toBe(1);
  });

  it('checkConversationMode returns true when mode is "human"', () => {
    expect(checkConversationMode({ mode: 'human' })).toBe(true);
  });

  it('checkConversationMode returns false when mode is "bot"', () => {
    expect(checkConversationMode({ mode: 'bot' })).toBe(false);
  });

  // P2 (T47, AIG-45/46/47/48): áudio baixa (Meta) e transcreve (Whisper),
  // sem jamais gravar o binário — só o ponteiro (mediaId/mime) e o texto
  // transcrito, este último só em memória (audioTranscription), nunca no
  // documento Message.
  describe('P2 — áudio transcrito (AIG-45/46/47/48)', () => {
    it('downloads and transcribes an audio message, returning audioTranscription and persisting only the Meta pointer — never the binary', async () => {
      const tenant = randomId();
      const phoneNumberId = randomId();
      const from = randomPhone();
      await seedCustomerTemplate(tenant);
      await seedChannel(tenant, phoneNumberId);
      const audioBuffer = Buffer.from('conteúdo binário fake do áudio');
      const downloadAudio = createFakeDownloadAudio(audioBuffer, 'audio/ogg');
      const whisperClient = createFakeWhisperClient({ text: 'Quero saber o status do meu pedido' });

      const result = await ingest(
        { phoneNumberId, wamid: 'wamid-audio-ok', from, type: 'audio', mediaId: 'meta-media-1' },
        { downloadAudio, whisperClient },
      );

      expect(result.resolved).toBe(true);
      if (!result.resolved) throw new Error('unreachable');
      expect(result.audioTranscription).toEqual({ text: 'Quero saber o status do meu pedido' });
      expect(downloadAudio).toHaveBeenCalledWith(expect.objectContaining({ phoneNumberId }), 'meta-media-1');
      expect(whisperClient.transcribe).toHaveBeenCalledWith(audioBuffer, 'audio/ogg');
      // Ponteiro persistido (mediaId + mime resolvido) — o Message.text
      // segue undefined: o binário/transcrição NUNCA são gravados no
      // documento em si (só trafegam em memória até chegar em guardInput).
      // `.lean()` (não `result.message` cru) porque um subdocumento Mongoose
      // não é um objeto plano — comparar direto com `toEqual` falharia por
      // campos internos ($__, _doc, etc.), nunca pelo dado em si.
      const persisted = await Message.findById(result.message._id).lean();
      expect(persisted?.media).toEqual({ mediaId: 'meta-media-1', mime: 'audio/ogg' });
      expect(persisted?.text).toBeUndefined();
      expect(JSON.stringify(persisted)).not.toContain(audioBuffer.toString('base64'));
    });

    it('never throws when Whisper returns {error} — persists only the pointer and returns the error as audioTranscription', async () => {
      const tenant = randomId();
      const phoneNumberId = randomId();
      const from = randomPhone();
      await seedCustomerTemplate(tenant);
      await seedChannel(tenant, phoneNumberId);
      const downloadAudio = createFakeDownloadAudio(Buffer.from('audio'), 'audio/ogg');
      const whisperClient = createFakeWhisperClient({ error: 'Whisper indisponível' });

      const result = await ingest(
        { phoneNumberId, wamid: 'wamid-audio-whisper-error', from, type: 'audio', mediaId: 'meta-media-2' },
        { downloadAudio, whisperClient },
      );

      expect(result.resolved).toBe(true);
      if (!result.resolved) throw new Error('unreachable');
      expect(result.audioTranscription).toEqual({ error: 'Whisper indisponível' });
      const persisted = await Message.findById(result.message._id).lean();
      expect(persisted?.text).toBeUndefined();
      expect(persisted?.media).toEqual({ mediaId: 'meta-media-2', mime: 'audio/ogg' });
    });

    it('never throws when downloadAudio itself fails (Meta network/token error) — returns the error as audioTranscription, never propagates', async () => {
      const tenant = randomId();
      const phoneNumberId = randomId();
      const from = randomPhone();
      await seedCustomerTemplate(tenant);
      await seedChannel(tenant, phoneNumberId);
      const downloadAudio = vi.fn(async (..._args: Parameters<DownloadAudio>) => {
        throw new Error('Falha ao resolver URL de mídia (status 401)');
      });
      const whisperClient = createFakeWhisperClient({ text: 'nunca deveria rodar' });

      const result = await ingest(
        { phoneNumberId, wamid: 'wamid-audio-download-fail', from, type: 'audio', mediaId: 'meta-media-3' },
        { downloadAudio, whisperClient },
      );

      expect(result.resolved).toBe(true);
      if (!result.resolved) throw new Error('unreachable');
      expect(result.audioTranscription).toEqual({ error: 'Falha ao resolver URL de mídia (status 401)' });
      expect(whisperClient.transcribe).not.toHaveBeenCalled();
      const persisted = await Message.findById(result.message._id).lean();
      expect(persisted?.text).toBeUndefined();
      expect(persisted?.media).toEqual({ mediaId: 'meta-media-3' });
    });

    it('an audio message with no downloadAudio/whisperClient injected behaves exactly like P1 — persists only the mediaId pointer, no transcription attempted', async () => {
      const tenant = randomId();
      const phoneNumberId = randomId();
      const from = randomPhone();
      await seedCustomerTemplate(tenant);
      await seedChannel(tenant, phoneNumberId);

      const result = await ingest({
        phoneNumberId,
        wamid: 'wamid-audio-p1',
        from,
        type: 'audio',
        mediaId: 'meta-media-4',
      });

      expect(result.resolved).toBe(true);
      if (!result.resolved) throw new Error('unreachable');
      expect(result.audioTranscription).toBeUndefined();
      const persisted = await Message.findById(result.message._id).lean();
      expect(persisted?.media).toEqual({ mediaId: 'meta-media-4' });
      expect(persisted?.text).toBeUndefined();
    });

    it.each(['image', 'document', 'location'] as const)(
      'a "%s" message persists only the Meta pointer (mediaId) and never invokes downloadAudio/whisperClient, even when injected (AIG-48)',
      async (type) => {
        const tenant = randomId();
        const phoneNumberId = randomId();
        const from = randomPhone();
        await seedCustomerTemplate(tenant);
        await seedChannel(tenant, phoneNumberId);
        const downloadAudio = createFakeDownloadAudio(Buffer.from('nunca deveria baixar'), 'irrelevant');
        const whisperClient = createFakeWhisperClient({ text: 'nunca deveria transcrever' });

        const result = await ingest(
          { phoneNumberId, wamid: `wamid-${type}`, from, type, mediaId: `meta-media-${type}` },
          { downloadAudio, whisperClient },
        );

        expect(result.resolved).toBe(true);
        if (!result.resolved) throw new Error('unreachable');
        const persisted = await Message.findById(result.message._id).lean();
        expect(persisted?.media).toEqual({ mediaId: `meta-media-${type}` });
        expect(persisted?.text).toBeUndefined();
        expect(result.audioTranscription).toBeUndefined();
        expect(downloadAudio).not.toHaveBeenCalled();
        expect(whisperClient.transcribe).not.toHaveBeenCalled();
      },
    );
  });
});
