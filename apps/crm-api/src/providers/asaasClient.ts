// Cliente fino do Asaas para crm-api — SÓ validação de chave e auto-registro
// de webhook, no momento em que o admin do tenant salva a integração
// (design.md Components: "AsaasClient (crm-api) — a separate, smaller
// client"). Deliberadamente NÃO compartilhado com o client maior do
// ai-gateway (cria cobrança/QR/consulta status) — conjuntos de métodos sem
// sobreposição real, aceito como pequena duplicação (design.md Tech
// Decisions/AD-034).
//
// Fatos de API confirmados via docs.asaas.com (design.md Research
// Provenance): header de auth é `access_token: <key>` (nunca
// `Authorization: Bearer`); prefixo `$aact_prod_...` = produção, senão
// sandbox; base URLs `api.asaas.com` (produção) / `api-sandbox.asaas.com`
// (sandbox); corpo de erro `{"errors":[{"code","description"}]}`.
export type AsaasEnvironment = 'sandbox' | 'production';

const ASAAS_BASE_URLS: Record<AsaasEnvironment, string> = {
  sandbox: 'https://api-sandbox.asaas.com/v3',
  production: 'https://api.asaas.com/v3',
};

const baseUrl = (environment: AsaasEnvironment): string => ASAAS_BASE_URLS[environment];

// Política de retry/backoff idêntica em espírito à referência DentalEase
// (services/shared/asaas.ts `call()`/`isTransient`), reimplementada
// nativamente com `fetch` (sem nova dependência) — 2 retentativas, backoff
// exponencial, só para falha transitória (5xx/429/erro de rede/timeout).
// Qualquer outro 4xx falha imediatamente, sem retry.
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

// Devolve a Response assim que ela para de ser transitória (2xx ou 4xx que
// não seja 429) — nunca re-tenta um 4xx "de verdade" (chave inválida,
// payload malformado). Erro de rede/timeout (fetch rejeita) é tratado como
// transitório, igual a um 5xx. Depois de esgotar as retentativas em um erro
// de rede/timeout, propaga esse erro (nunca engole).
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

const authHeaders = (apiKey: string): Record<string, string> => ({ access_token: apiKey });

// GET /v3/customers?limit=1 — 401 (chave inválida/revogada) vira `false`,
// 2xx vira `true` (design.md Components/spec.md P1 "Tenant configura sua
// própria chave Asaas" AC1/AC2). Qualquer outro status é um erro genuíno de
// comunicação com o Asaas, propagado para o chamador decidir.
export const validateApiKey = async (apiKey: string, environment: AsaasEnvironment): Promise<boolean> => {
  const res = await call(`${baseUrl(environment)}/customers?limit=1`, {
    method: 'GET',
    headers: authHeaders(apiKey),
  });
  if (res.status === 401) return false;
  if (res.ok) return true;
  throw new AsaasApiError(`Falha ao validar chave Asaas (status ${res.status})`, res.status);
};

// Eventos de pagamento assinados no webhook por tenant — só o que este
// feature usa (PIX, sem assinatura/split, Out of Scope de spec.md).
const ASAAS_PAYMENT_WEBHOOK_EVENTS = [
  'PAYMENT_CREATED',
  'PAYMENT_UPDATED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_RECEIVED',
  'PAYMENT_OVERDUE',
  'PAYMENT_REFUNDED',
  'PAYMENT_DELETED',
  'PAYMENT_CHARGEBACK_REQUESTED',
  'PAYMENT_CHARGEBACK_DISPUTE',
  'PAYMENT_AWAITING_CHARGEBACK_REVERSAL',
] as const;

export type RegisterWebhookResult = { asaasWebhookId: string };

// Auto-registro do webhook do tenant no Asaas, no momento em que a
// integração é salva (design.md Tech Decisions "Self-registering the
// tenant's webhook with Asaas at integration-save time") — payload no
// formato confirmado pela referência DentalEase (services/shared/asaas.ts
// `registerWebhook`), adaptado: `url` já inclui o `webhookToken` opaco do
// tenant, `authToken` é o valor que o Asaas ecoa de volta no header
// `asaas-access-token` em toda chamada futura (nunca a apiKey em si).
export const registerWebhook = async (
  apiKey: string,
  environment: AsaasEnvironment,
  url: string,
  authToken: string,
): Promise<RegisterWebhookResult> => {
  const res = await call(`${baseUrl(environment)}/webhooks`, {
    method: 'POST',
    headers: { ...authHeaders(apiKey), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'CRM Payments',
      url,
      enabled: true,
      interrupted: false,
      apiVersion: 3,
      authToken,
      sendType: 'SEQUENTIALLY',
      events: ASAAS_PAYMENT_WEBHOOK_EVENTS,
    }),
  });

  if (!res.ok) throw new AsaasApiError(`Falha ao registrar webhook Asaas (status ${res.status})`, res.status);
  const data = (await res.json()) as { id: string };
  return { asaasWebhookId: data.id };
};
