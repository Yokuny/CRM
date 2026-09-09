import type { AsaasClient, AsaasIntegrationRef } from '@crm/ai-kit';
import { decrypt } from '@crm/db';

// Implementação REAL do `AsaasClient` (packages/ai-kit/src/providers/asaasClient.ts,
// T14, tipo apenas) — o único lugar em apps/ai-gateway que fala com a API de verdade
// do Asaas (design.md Components "AsaasClient (ai-gateway)"). Deliberadamente NÃO
// compartilhada com o client menor de apps/crm-api (validação de chave + registro de
// webhook) — conjuntos de métodos sem sobreposição real, aceito como pequena
// duplicação (design.md Tech Decisions/AD-034), incluindo esta mesma política de
// retry/backoff (reimplementada aqui, nunca importada de crm-api).
//
// Fatos de API confirmados via docs.asaas.com (design.md Research Provenance): header
// de auth é `access_token: <key>`; base URLs `api.asaas.com` (produção) /
// `api-sandbox.asaas.com` (sandbox); `POST /v3/payments` exige
// customer/billingType/value/dueDate; `GET /v3/payments/{id}/pixQrCode` devolve
// `{encodedImage, payload, expirationDate}`.
const ASAAS_BASE_URLS = {
  sandbox: 'https://api-sandbox.asaas.com/v3',
  production: 'https://api.asaas.com/v3',
} as const;

const baseUrl = (integration: AsaasIntegrationRef): string => ASAAS_BASE_URLS[integration.environment];

// Política de retry/backoff idêntica em espírito à referência DentalEase
// (services/shared/asaas.ts `call()`/`isTransient`) e ao client de apps/crm-api (T8) —
// 2 retentativas, backoff exponencial, só para falha transitória (5xx/429/erro de
// rede/timeout). Qualquer outro 4xx falha imediatamente, sem retry.
const ASAAS_MAX_RETRIES = 2;
const ASAAS_RETRY_BASE_DELAY_MS = 50;
const ASAAS_TIMEOUT_MS = 15_000;

export class AsaasApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'AsaasApiError';
    this.status = status;
  }
}

const isTransientStatus = (status: number): boolean => status === 429 || status >= 500;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Devolve a Response assim que ela para de ser transitória (2xx ou 4xx que não seja
// 429) — nunca re-tenta um 4xx "de verdade". Erro de rede/timeout (fetch rejeita) é
// tratado como transitório, igual a um 5xx; depois de esgotar as retentativas nesse
// caso, propaga o erro (nunca engole).
const call = async (url: string, init: RequestInit): Promise<Response> => {
  let lastNetworkError: unknown;
  let lastResponse: Response | undefined;

  for (let attempt = 0; attempt <= ASAAS_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ASAAS_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok || !isTransientStatus(res.status)) return res;
      lastResponse = res;
    } catch (e) {
      clearTimeout(timeout);
      lastNetworkError = e;
    }

    if (attempt === ASAAS_MAX_RETRIES) break;
    await delay(ASAAS_RETRY_BASE_DELAY_MS * 2 ** attempt);
  }

  if (lastResponse) return lastResponse;
  throw lastNetworkError;
};

// Chave decifrada A CADA chamada (nunca cacheada em texto plano além do escopo de uma
// única requisição HTTP) — `masterEncKey` é a chave mestra (ASAAS_ENC_KEY), `apiKeyEnc`
// vem do AsaasIntegration do tenant.
const authHeaders = (integration: AsaasIntegrationRef, masterEncKey: string): Record<string, string> => ({
  access_token: decrypt(integration.apiKeyEnc, masterEncKey),
  'Content-Type': 'application/json',
});

// Ponto único de conversão de moeda (design.md, referência DentalEase
// `centavosToReais`/linha 72-73): nosso domínio inteiro usa INTEIROS EM CENTAVOS
// (Order.totalPrice, Payment.value); a API do Asaas exige `value` como decimal EM
// REAIS. A conversão acontece só aqui, na fronteira exata da chamada HTTP — nunca
// antes, nunca em quem chama este client.
const centsToReais = (cents: number): number => Math.round(cents) / 100;

type AsaasCustomerResponse = { id: string };
type AsaasChargeResponse = { id: string };
type AsaasPixQrCodeResponse = { encodedImage?: string; payload?: string; expirationDate?: string };
type AsaasGetChargeResponse = { status: string };

export const createAsaasClient = (masterEncKey: string): AsaasClient => {
  const ensureCustomer: AsaasClient['ensureCustomer'] = async (integration, customer) => {
    const res = await call(`${baseUrl(integration)}/customers`, {
      method: 'POST',
      headers: authHeaders(integration, masterEncKey),
      body: JSON.stringify({ name: customer.name, phone: customer.phone, cpfCnpj: customer.document }),
    });
    if (!res.ok) throw new AsaasApiError(`Falha ao criar cliente Asaas (status ${res.status})`, res.status);
    const data = (await res.json()) as AsaasCustomerResponse;
    return { asaasCustomerId: data.id };
  };

  const createPixCharge: AsaasClient['createPixCharge'] = async (integration, params) => {
    const res = await call(`${baseUrl(integration)}/payments`, {
      method: 'POST',
      headers: authHeaders(integration, masterEncKey),
      body: JSON.stringify({
        customer: params.asaasCustomerId,
        billingType: 'PIX',
        value: centsToReais(params.value),
        dueDate: params.dueDate,
        description: params.description,
      }),
    });
    if (!res.ok) throw new AsaasApiError(`Falha ao criar cobrança Asaas (status ${res.status})`, res.status);
    const charge = (await res.json()) as AsaasChargeResponse;

    // GET pixQrCode é best-effort (design.md Edge Cases/T15 Done-when): uma falha
    // aqui NÃO derruba a chamada inteira — a cobrança já foi criada de verdade no
    // Asaas, então devolvemos o que temos sem `pixPayload`/`pixEncodedImage`.
    try {
      const qrRes = await call(`${baseUrl(integration)}/payments/${charge.id}/pixQrCode`, {
        method: 'GET',
        headers: authHeaders(integration, masterEncKey),
      });
      if (!qrRes.ok) return { asaasChargeId: charge.id };
      const qr = (await qrRes.json()) as AsaasPixQrCodeResponse;
      return {
        asaasChargeId: charge.id,
        pixPayload: qr.payload,
        pixEncodedImage: qr.encodedImage,
        pixExpirationDate: qr.expirationDate ? new Date(qr.expirationDate) : undefined,
      };
    } catch {
      return { asaasChargeId: charge.id };
    }
  };

  const getCharge: AsaasClient['getCharge'] = async (integration, asaasChargeId) => {
    const res = await call(`${baseUrl(integration)}/payments/${asaasChargeId}`, {
      method: 'GET',
      headers: authHeaders(integration, masterEncKey),
    });
    if (!res.ok) throw new AsaasApiError(`Falha ao consultar cobrança Asaas (status ${res.status})`, res.status);
    const data = (await res.json()) as AsaasGetChargeResponse;
    return { asaasStatus: data.status };
  };

  return { ensureCustomer, createPixCharge, getCharge };
};
