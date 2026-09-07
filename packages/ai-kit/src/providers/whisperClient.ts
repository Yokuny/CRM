import OpenAI, { toFile } from 'openai';

export type WhisperTranscription = { text: string } | { error: string };

export type WhisperClient = {
  transcribe: (audioBuffer: Buffer, mime: string) => Promise<WhisperTranscription>;
};

const WHISPER_MODEL = 'whisper-1';

// Mesmo molde de injeção de anthropicClient.ts (T11): singleton preguiçoso,
// chave checada em toda chamada.
let client: OpenAI | null = null;

const getClient = (apiKey: string): OpenAI => {
  if (!apiKey) throw new Error('OPENAI_API_KEY é obrigatório');
  if (!client) client = new OpenAI({ apiKey });
  return client;
};

// Whisper exige um nome de arquivo com extensão reconhecida — deriva do
// subtipo MIME (ex.: "audio/ogg" -> "ogg", o formato dominante do WhatsApp).
const extensionForMime = (mime: string): string => mime.split('/')[1]?.split(';')[0] || 'ogg';

// Contrato do executor (T24/T47, fallback de indisponibilidade): `transcribe`
// NUNCA lança — qualquer falha do provider (rede, chave revogada, formato
// rejeitado) vira `{error}`, nunca uma exceção não tratada.
export const createWhisperClient = (apiKey: string): WhisperClient => {
  const openai = getClient(apiKey);
  return {
    transcribe: async (audioBuffer, mime) => {
      try {
        const file = await toFile(audioBuffer, `audio.${extensionForMime(mime)}`, { type: mime });
        const transcription = await openai.audio.transcriptions.create({ file, model: WHISPER_MODEL });
        return { text: transcription.text };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Falha ao transcrever áudio' };
      }
    },
  };
};
