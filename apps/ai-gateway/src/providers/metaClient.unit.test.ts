import { encrypt } from '@crm/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMetaClient, MetaApiError } from './metaClient.js';

const ENC_KEY = Buffer.alloc(32, 3).toString('base64');
const RAW_TOKEN = 'meta-access-token-plano';
const CHANNEL = { phoneNumberId: '1234567890', accessTokenEnc: encrypt(RAW_TOKEN, ENC_KEY) };

const jsonResponse = (body: unknown, ok = true, status = 200): Response =>
  ({ ok, status, json: () => Promise.resolve(body) }) as Response;

describe('createMetaClient (AIG-28/45 — Send/Media API da Meta Cloud API)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sendText calls POST /{phoneNumberId}/messages with the decrypted token and a text body', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse({ messages: [{ id: 'wamid.text-1' }] }));
    const client = createMetaClient(CHANNEL, ENC_KEY);

    const result = await client.sendText('5511999999999', 'Olá, cliente!');

    expect(result).toEqual({ wamid: 'wamid.text-1' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://graph.facebook.com/v21.0/${CHANNEL.phoneNumberId}/messages`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${RAW_TOKEN}`);
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ messaging_product: 'whatsapp', to: '5511999999999', type: 'text', text: { body: 'Olá, cliente!' } });
  });

  it('sendTemplate calls the same endpoint with a template body carrying name/language/params', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse({ messages: [{ id: 'wamid.tpl-1' }] }));
    const client = createMetaClient(CHANNEL, ENC_KEY);

    const result = await client.sendTemplate('5511999999999', 'boas_vindas', 'pt_BR', { nome: 'Maria' });

    expect(result).toEqual({ wamid: 'wamid.tpl-1' });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      messaging_product: 'whatsapp',
      to: '5511999999999',
      type: 'template',
      template: {
        name: 'boas_vindas',
        language: { code: 'pt_BR' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: 'Maria' }] }],
      },
    });
  });

  it('getMediaUrl then downloadMedia follow the Meta 2-step media flow', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ url: 'https://lookaside.fbsbx.com/temp/media-1', mime_type: 'audio/ogg' }),
    );
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(new TextEncoder().encode('audio-bytes').buffer),
    } as unknown as Response);
    const client = createMetaClient(CHANNEL, ENC_KEY);

    const mediaUrl = await client.getMediaUrl('media-id-1');
    const buffer = await client.downloadMedia(mediaUrl.url);

    expect(mediaUrl).toEqual({ url: 'https://lookaside.fbsbx.com/temp/media-1', mimeType: 'audio/ogg' });
    expect(fetchMock.mock.calls[0][0]).toBe(`https://graph.facebook.com/v21.0/media-id-1`);
    expect(fetchMock.mock.calls[1][0]).toBe('https://lookaside.fbsbx.com/temp/media-1');
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.toString()).toBe('audio-bytes');
  });

  it('a failed fetch (non-ok response) propagates as a typed MetaApiError, not a generic Error', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 401));
    const client = createMetaClient(CHANNEL, ENC_KEY);

    await expect(client.sendText('5511999999999', 'oi')).rejects.toBeInstanceOf(MetaApiError);
  });

  it('decrypts the Channel token fresh before every call (never reuses a stale plaintext across calls)', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse({ messages: [{ id: 'wamid.x' }] }));
    const client = createMetaClient(CHANNEL, ENC_KEY);

    await client.sendText('5511999999999', 'a');
    await client.sendText('5511999999999', 'b');

    const authHeaders = fetchMock.mock.calls.map((call) => {
      const [, init] = call as [string, RequestInit];
      return (init.headers as Record<string, string>).Authorization;
    });
    expect(authHeaders).toEqual([`Bearer ${RAW_TOKEN}`, `Bearer ${RAW_TOKEN}`]);
  });
});
