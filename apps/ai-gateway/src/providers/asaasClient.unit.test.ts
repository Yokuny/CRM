import { encrypt } from '@crm/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AsaasApiError, createAsaasClient } from './asaasClient.js';

const ENC_KEY = Buffer.alloc(32, 5).toString('base64');
const API_KEY = '$aact_hmlg_test-key-1234567890';
const integration = { apiKeyEnc: encrypt(API_KEY, ENC_KEY), environment: 'sandbox' as const };

const jsonResponse = (status: number, body: unknown): Response =>
  ({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) }) as unknown as Response;

describe('createAsaasClient (ai-gateway) — design.md Components "AsaasClient (ai-gateway)"', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('ensureCustomer', () => {
    it('posts POST /v3/customers with name/phone/document and returns {asaasCustomerId}', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: 'cus_123' }));
      const client = createAsaasClient(ENC_KEY);

      const result = await client.ensureCustomer(integration, {
        name: 'Maria',
        phone: '5511999999999',
        document: '12345678900',
      });

      expect(result).toEqual({ asaasCustomerId: 'cus_123' });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api-sandbox.asaas.com/v3/customers');
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>).access_token).toBe(API_KEY);
      const body = JSON.parse(init.body as string);
      expect(body).toEqual({ name: 'Maria', phone: '5511999999999', cpfCnpj: '12345678900' });
    });
  });

  describe('createPixCharge', () => {
    // CRITICAL FACT (design.md Reference implementation citation): Asaas expects
    // `value` as a decimal IN REAIS; this codebase's domain (Order.totalPrice,
    // Payment.value) is integer CENTS. The conversion must happen ONLY at the HTTP
    // boundary. 1050 cents must become exactly 10.5 in the request body — asserted
    // directly on the parsed body, not merely that a call happened.
    it('converts cents to reais at the exact HTTP boundary (1050 cents -> body.value === 10.5)', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { id: 'pay_123', status: 'PENDING' }))
        .mockResolvedValueOnce(
          jsonResponse(200, { encodedImage: 'base64img', payload: '00020126...', expirationDate: '2026-09-10 12:00:00' }),
        );
      const client = createAsaasClient(ENC_KEY);

      await client.createPixCharge(integration, {
        asaasCustomerId: 'cus_123',
        value: 1050,
        description: 'Pedido X',
        dueDate: '2026-09-09',
      });

      const [chargeUrl, chargeInit] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(chargeUrl).toBe('https://api-sandbox.asaas.com/v3/payments');
      expect(chargeInit.method).toBe('POST');
      const chargeBody = JSON.parse(chargeInit.body as string);
      expect(chargeBody.value).toBe(10.5);
    });

    it('calls POST /v3/payments (billingType PIX) then GET /v3/payments/{id}/pixQrCode, returning both charge + PIX fields', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { id: 'pay_123', status: 'PENDING' }))
        .mockResolvedValueOnce(
          jsonResponse(200, { encodedImage: 'base64img', payload: '00020126...', expirationDate: '2026-09-10 12:00:00' }),
        );
      const client = createAsaasClient(ENC_KEY);

      const result = await client.createPixCharge(integration, {
        asaasCustomerId: 'cus_123',
        value: 1050,
        description: 'Pedido X',
        dueDate: '2026-09-09',
      });

      expect(result).toEqual({
        asaasChargeId: 'pay_123',
        pixPayload: '00020126...',
        pixEncodedImage: 'base64img',
        pixExpirationDate: new Date('2026-09-10 12:00:00'),
      });
      const [chargeUrl, chargeInit] = fetchMock.mock.calls[0] as [string, RequestInit];
      const chargeBody = JSON.parse(chargeInit.body as string);
      expect(chargeBody).toEqual({
        customer: 'cus_123',
        billingType: 'PIX',
        value: 10.5,
        dueDate: '2026-09-09',
        description: 'Pedido X',
      });
      const [qrUrl, qrInit] = fetchMock.mock.calls[1] as [string, RequestInit];
      expect(qrUrl).toBe('https://api-sandbox.asaas.com/v3/payments/pay_123/pixQrCode');
      expect(qrInit.method).toBe('GET');
    });

    // design.md Edge Cases: "the Asaas API call succeeds for the charge but the
    // follow-up PIX QR Code fetch fails THEN the system SHALL still persist the
    // Payment ... best-effort". A QR failure must NOT throw out of createPixCharge —
    // the charge id/status are never lost.
    it('returns the charge WITHOUT pixPayload/pixEncodedImage when the QR fetch resolves non-ok (best-effort, does not fail the whole call)', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { id: 'pay_456', status: 'PENDING' }))
        .mockResolvedValueOnce(jsonResponse(404, { errors: [{ description: 'not found' }] }));
      const client = createAsaasClient(ENC_KEY);

      const result = await client.createPixCharge(integration, {
        asaasCustomerId: 'cus_123',
        value: 500,
        description: 'Pedido Y',
        dueDate: '2026-09-09',
      });

      expect(result).toEqual({ asaasChargeId: 'pay_456' });
      expect('pixPayload' in result).toBe(false);
      expect('pixEncodedImage' in result).toBe(false);
    });

    it('returns the charge WITHOUT pixPayload/pixEncodedImage when the QR fetch throws (network error, best-effort)', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { id: 'pay_789', status: 'PENDING' }))
        .mockRejectedValue(new Error('QR endpoint unreachable'));
      const client = createAsaasClient(ENC_KEY);

      const result = await client.createPixCharge(integration, {
        asaasCustomerId: 'cus_123',
        value: 700,
        description: 'Pedido Z',
        dueDate: '2026-09-09',
      });

      expect(result).toEqual({ asaasChargeId: 'pay_789' });
      expect('pixPayload' in result).toBe(false);
      expect('pixEncodedImage' in result).toBe(false);
    });

    it('throws AsaasApiError when charge creation itself fails (non-transient 4xx), never reaching the QR step', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(jsonResponse(400, { errors: [{ description: 'invalid customer' }] }));
      const client = createAsaasClient(ENC_KEY);

      await expect(
        client.createPixCharge(integration, {
          asaasCustomerId: 'cus_123',
          value: 500,
          description: 'Pedido W',
          dueDate: '2026-09-09',
        }),
      ).rejects.toBeInstanceOf(AsaasApiError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCharge', () => {
    it('calls GET /v3/payments/{id} and returns {asaasStatus} from the raw Asaas status', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: 'pay_123', status: 'CONFIRMED' }));
      const client = createAsaasClient(ENC_KEY);

      const result = await client.getCharge(integration, 'pay_123');

      expect(result).toEqual({ asaasStatus: 'CONFIRMED' });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api-sandbox.asaas.com/v3/payments/pay_123');
      expect(init.method).toBe('GET');
    });

    it('selects the production base URL for environment "production"', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { status: 'PENDING' }));
      const client = createAsaasClient(ENC_KEY);
      const prodIntegration = { apiKeyEnc: encrypt(API_KEY, ENC_KEY), environment: 'production' as const };

      await client.getCharge(prodIntegration, 'pay_1');

      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.asaas.com/v3/payments/pay_1');
    });

    // Retry/backoff policy (design.md Tech Decisions: same policy as T8, reimplemented
    // independently) — exercised once here via getCharge (a single-fetch method);
    // createPixCharge/ensureCustomer share the exact same underlying `call()` helper,
    // so re-testing identical retry behavior per method would be redundant.
    it('retries a transient 500 with exponential backoff, then resolves on eventual success', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock
        .mockResolvedValueOnce(jsonResponse(500, { errors: [{ description: 'internal error' }] }))
        .mockResolvedValueOnce(jsonResponse(502, { errors: [{ description: 'bad gateway' }] }))
        .mockResolvedValueOnce(jsonResponse(200, { status: 'CONFIRMED' }));
      const client = createAsaasClient(ENC_KEY);

      const result = await client.getCharge(integration, 'pay_1');

      expect(result).toEqual({ asaasStatus: 'CONFIRMED' });
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('retries a 429 rate-limit response with backoff, then succeeds', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock
        .mockResolvedValueOnce(jsonResponse(429, { errors: [{ description: 'rate limited' }] }))
        .mockResolvedValueOnce(jsonResponse(200, { status: 'PENDING' }));
      const client = createAsaasClient(ENC_KEY);

      const result = await client.getCharge(integration, 'pay_1');

      expect(result).toEqual({ asaasStatus: 'PENDING' });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('retries a network/timeout error (fetch rejects) with backoff, then succeeds', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      const timeoutError = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
      fetchMock.mockRejectedValueOnce(timeoutError).mockResolvedValueOnce(jsonResponse(200, { status: 'PENDING' }));
      const client = createAsaasClient(ENC_KEY);

      const result = await client.getCharge(integration, 'pay_1');

      expect(result).toEqual({ asaasStatus: 'PENDING' });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('throws immediately on a non-transient 4xx (e.g. 404), with no retry', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValueOnce(jsonResponse(404, { errors: [{ description: 'not found' }] }));
      const client = createAsaasClient(ENC_KEY);

      await expect(client.getCharge(integration, 'pay_missing')).rejects.toBeInstanceOf(AsaasApiError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('propagates the network error after exhausting all retries on persistent transient failure', async () => {
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      const networkError = new Error('network unreachable');
      fetchMock.mockRejectedValue(networkError);
      const client = createAsaasClient(ENC_KEY);

      await expect(client.getCharge(integration, 'pay_1')).rejects.toBe(networkError);
      // 1 tentativa inicial + 2 retentativas (ASAAS_MAX_RETRIES=2) = 3 chamadas.
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });

  describe('decryption per-call', () => {
    // Prova real de "nunca cacheia": duas integrações com chaves DIFERENTES,
    // decifradas em chamadas separadas do MESMO client — se a implementação
    // cacheasse a chave decifrada da primeira chamada, o header da segunda chamada
    // mostraria a chave ERRADA (a da primeira integração).
    it('decrypts each integration key fresh per call — never reuses a previously decrypted key', async () => {
      const otherApiKey = '$aact_hmlg_other-key-0987654321';
      const otherIntegration = { apiKeyEnc: encrypt(otherApiKey, ENC_KEY), environment: 'sandbox' as const };
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
      fetchMock.mockResolvedValue(jsonResponse(200, { status: 'PENDING' }));
      const client = createAsaasClient(ENC_KEY);

      await client.getCharge(integration, 'pay_1');
      await client.getCharge(otherIntegration, 'pay_2');

      const headers = fetchMock.mock.calls.map((call) => (call[1] as RequestInit).headers as Record<string, string>);
      expect(headers[0].access_token).toBe(API_KEY);
      expect(headers[1].access_token).toBe(otherApiKey);
    });
  });
});
