import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AsaasApiError, registerWebhook, validateApiKey } from './asaasClient.js';

const API_KEY = '$aact_hmlg_test-key-1234567890';

const jsonResponse = (status: number, body: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }) as unknown as Response;

describe('asaasClient (spec.md P1 "Tenant configura sua própria chave Asaas")', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('validateApiKey', () => {
    it('resolves false on a 401 response (AC2: invalid/revoked key rejected)', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(jsonResponse(401, { errors: [{ description: 'invalid api key' }] }));

      const result = await validateApiKey(API_KEY, 'sandbox');

      expect(result).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('resolves true on a 200 response (AC1: valid key)', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: [] }));

      const result = await validateApiKey(API_KEY, 'sandbox');

      expect(result).toBe(true);
    });

    it('calls GET /customers?limit=1 with the access_token header (never Authorization: Bearer)', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: [] }));

      await validateApiKey(API_KEY, 'sandbox');

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api-sandbox.asaas.com/v3/customers?limit=1');
      expect(init.method).toBe('GET');
      expect((init.headers as Record<string, string>).access_token).toBe(API_KEY);
      expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    });

    it('selects the production base URL for environment "production"', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: [] }));

      await validateApiKey(API_KEY, 'production');

      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.asaas.com/v3/customers?limit=1');
    });

    it('retries a transient 500 with exponential backoff, then resolves true on eventual success', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock
        .mockResolvedValueOnce(jsonResponse(500, { errors: [{ description: 'internal error' }] }))
        .mockResolvedValueOnce(jsonResponse(502, { errors: [{ description: 'bad gateway' }] }))
        .mockResolvedValueOnce(jsonResponse(200, { data: [] }));

      const result = await validateApiKey(API_KEY, 'sandbox');

      expect(result).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('retries a 429 rate-limit response with backoff, then succeeds', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock
        .mockResolvedValueOnce(jsonResponse(429, { errors: [{ description: 'rate limited' }] }))
        .mockResolvedValueOnce(jsonResponse(200, { data: [] }));

      const result = await validateApiKey(API_KEY, 'sandbox');

      expect(result).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('retries a network/timeout error (fetch rejects) with backoff, then succeeds', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      const timeoutError = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
      fetchMock.mockRejectedValueOnce(timeoutError).mockResolvedValueOnce(jsonResponse(200, { data: [] }));

      const result = await validateApiKey(API_KEY, 'sandbox');

      expect(result).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('throws immediately on a non-401 4xx (e.g. 403), with no retry', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(jsonResponse(403, { errors: [{ description: 'forbidden' }] }));

      await expect(validateApiKey(API_KEY, 'sandbox')).rejects.toBeInstanceOf(AsaasApiError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('propagates the network error after exhausting all retries on persistent transient failure', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      const networkError = new Error('network unreachable');
      fetchMock.mockRejectedValue(networkError);

      await expect(validateApiKey(API_KEY, 'sandbox')).rejects.toBe(networkError);
      // 1 tentativa inicial + 2 retentativas (ASAAS_MAX_RETRIES=2) = 3 chamadas.
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });

  describe('registerWebhook', () => {
    it('posts the expected payload shape and returns {asaasWebhookId} from the created webhook id', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, {
          id: 'wh_123',
          name: 'CRM Payments',
          url: 'https://app.example.com/webhooks/asaas/tok',
          enabled: true,
        }),
      );

      const result = await registerWebhook(
        API_KEY,
        'sandbox',
        'https://app.example.com/webhooks/asaas/tok',
        'auth-token-abc',
      );

      expect(result).toEqual({ asaasWebhookId: 'wh_123' });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api-sandbox.asaas.com/v3/webhooks');
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>).access_token).toBe(API_KEY);
      const body = JSON.parse(init.body as string);
      expect(body.url).toBe('https://app.example.com/webhooks/asaas/tok');
      expect(body.authToken).toBe('auth-token-abc');
      expect(body.enabled).toBe(true);
      expect(Array.isArray(body.events)).toBe(true);
      expect(body.events.length).toBeGreaterThan(0);
    });

    it('throws AsaasApiError on a non-2xx final response, without a retry for a non-transient 4xx', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(jsonResponse(400, { errors: [{ description: 'invalid url' }] }));

      await expect(registerWebhook(API_KEY, 'sandbox', 'not-a-url', 'auth-token-abc')).rejects.toBeInstanceOf(
        AsaasApiError,
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('retries a transient failure before succeeding', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock
        .mockResolvedValueOnce(jsonResponse(503, { errors: [{ description: 'unavailable' }] }))
        .mockResolvedValueOnce(jsonResponse(200, { id: 'wh_456' }));

      const result = await registerWebhook(
        API_KEY,
        'sandbox',
        'https://app.example.com/webhooks/asaas/tok',
        'auth-token-abc',
      );

      expect(result).toEqual({ asaasWebhookId: 'wh_456' });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
