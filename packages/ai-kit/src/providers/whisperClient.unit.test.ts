import { beforeEach, describe, expect, it, vi } from 'vitest';

const transcriptionsCreateMock = vi.fn();
const toFileMock = vi.fn().mockResolvedValue('fake-file-handle');
const openAiConstructorMock = vi.fn().mockImplementation(function OpenAIMock(this: {
  audio: { transcriptions: { create: typeof transcriptionsCreateMock } };
}) {
  this.audio = { transcriptions: { create: transcriptionsCreateMock } };
});

vi.mock('openai', () => ({ default: openAiConstructorMock, toFile: toFileMock }));

describe('createWhisperClient (P2, AIG-45/47)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('throws naming OPENAI_API_KEY when apiKey is empty', async () => {
    const { createWhisperClient } = await import('./whisperClient.js');

    expect(() => createWhisperClient('')).toThrow(/OPENAI_API_KEY/);
  });

  it('transcribe returns {error} (never throws) when the underlying provider rejects', async () => {
    const { createWhisperClient } = await import('./whisperClient.js');
    transcriptionsCreateMock.mockRejectedValueOnce(new Error('provider indisponível'));
    const client = createWhisperClient('sk-test');

    const result = await client.transcribe(Buffer.from('audio'), 'audio/ogg');

    expect(result).toEqual({ error: 'provider indisponível' });
  });

  it('transcribe returns the exact transcribed text when the underlying provider succeeds', async () => {
    const { createWhisperClient } = await import('./whisperClient.js');
    transcriptionsCreateMock.mockResolvedValueOnce({ text: 'olá mundo' });
    const client = createWhisperClient('sk-test');

    const result = await client.transcribe(Buffer.from('audio'), 'audio/ogg');

    expect(result).toEqual({ text: 'olá mundo' });
  });
});
