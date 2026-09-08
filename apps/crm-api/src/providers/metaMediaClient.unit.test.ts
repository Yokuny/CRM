import { encrypt } from '@crm/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMetaMediaClient, MetaApiError } from './metaMediaClient.js';

const ENC_KEY = Buffer.alloc(32, 7).toString('base64');
const RAW_TOKEN = 'meta-media-access-token-plano';
const CHANNEL = { phoneNumberId: '1234567890', accessTokenEnc: encrypt(RAW_TOKEN, ENC_KEY) };

describe('createMetaMediaClient (spec.md P2 AC2 — preview de mídia sob demanda)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('getMediaUrl resolves {url, mimeType} on a 2xx response, sending the decrypted token as Bearer', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ url: 'https://lookaside.fbsbx.com/temp/media-1', mime_type: 'image/png' }),
    } as unknown as Response);
    const client = createMetaMediaClient(CHANNEL, ENC_KEY);

    const result = await client.getMediaUrl('media-id-1');

    expect(result).toEqual({ url: 'https://lookaside.fbsbx.com/temp/media-1', mimeType: 'image/png' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v21.0/media-id-1');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${RAW_TOKEN}`);
  });

  it('getMediaUrl rejects with a typed MetaApiError (not a generic Error) on a non-2xx response', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, json: () => Promise.resolve({}) } as unknown as Response);
    const client = createMetaMediaClient(CHANNEL, ENC_KEY);

    await expect(client.getMediaUrl('media-id-1')).rejects.toBeInstanceOf(MetaApiError);
  });

  it('downloadMedia resolves a Buffer on a 2xx response, sending the decrypted token as Bearer', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(new TextEncoder().encode('imagem-bytes').buffer),
    } as unknown as Response);
    const client = createMetaMediaClient(CHANNEL, ENC_KEY);

    const buffer = await client.downloadMedia('https://lookaside.fbsbx.com/temp/media-1');

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.toString()).toBe('imagem-bytes');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://lookaside.fbsbx.com/temp/media-1');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${RAW_TOKEN}`);
  });

  it('downloadMedia rejects with a typed MetaApiError (not a generic Error) on a non-2xx response (e.g. expired URL)', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 410,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    } as unknown as Response);
    const client = createMetaMediaClient(CHANNEL, ENC_KEY);

    await expect(client.downloadMedia('https://lookaside.fbsbx.com/temp/expired')).rejects.toBeInstanceOf(MetaApiError);
  });

  it('decrypts the Channel token fresh before every call (never reuses a stale plaintext across calls)', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ url: 'https://lookaside.fbsbx.com/temp/media-x' }),
    } as unknown as Response);
    const client = createMetaMediaClient(CHANNEL, ENC_KEY);

    await client.getMediaUrl('media-id-1');
    await client.getMediaUrl('media-id-2');

    const authHeaders = fetchMock.mock.calls.map((call) => {
      const [, init] = call as [string, RequestInit];
      return (init.headers as Record<string, string>).Authorization;
    });
    expect(authHeaders).toEqual([`Bearer ${RAW_TOKEN}`, `Bearer ${RAW_TOKEN}`]);
  });
});
