import { decrypt, type EncryptedSecret } from '@crm/db';

// Wrapper fino e injetável sobre a Meta Cloud API (design.md Integration
// Points) — molde de injeção idêntico a anthropicClient.ts/whisperClient.ts
// (packages/ai-kit, T11/T12): quem chama (outboxConsumer, T29) nunca importa
// `fetch`/a URL da Meta diretamente, recebe só este objeto — em teste vira um
// fake com a mesma assinatura. Não é escolha de produto — é como a Send/Media
// API da Meta funcionam (fato técnico, mesma classificação de
// design.md Tech Decisions para a verificação do webhook).
const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export type MetaSendResult = { wamid: string };
export type MetaMediaUrlResult = { url: string; mimeType?: string };

export type MetaChannel = {
  phoneNumberId: string;
  accessTokenEnc: EncryptedSecret;
};

export type MetaClient = {
  sendText: (to: string, text: string) => Promise<MetaSendResult>;
  sendTemplate: (
    to: string,
    templateName: string,
    templateLanguage: string,
    templateParams?: Record<string, string>,
  ) => Promise<MetaSendResult>;
  getMediaUrl: (mediaId: string) => Promise<MetaMediaUrlResult>;
  downloadMedia: (url: string) => Promise<Buffer>;
};

// Erro tipado (Done-when T26): falha do fetch propaga como isto, nunca um
// erro genérico — outboxConsumer (T29) decide o retry/backoff a partir daqui,
// não esta task.
export class MetaApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'MetaApiError';
    this.status = status;
  }
}

type MetaSendMessageResponse = { messages?: { id: string }[] };
type MetaMediaLookupResponse = { url: string; mime_type?: string };

const postMessage = async (phoneNumberId: string, token: string, body: unknown): Promise<MetaSendResult> => {
  const res = await fetch(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new MetaApiError(`Falha ao enviar mensagem via Meta (status ${res.status})`, res.status);

  const data = (await res.json()) as MetaSendMessageResponse;
  const wamid = data.messages?.[0]?.id;
  if (!wamid) throw new MetaApiError('Resposta da Meta sem wamid');
  return { wamid };
};

// Token do Channel decifrado (T1) antes de CADA chamada (design.md) — nunca
// cacheado em texto plano além do escopo de uma única requisição HTTP.
export const createMetaClient = (channel: MetaChannel, encKey: string): MetaClient => {
  const token = (): string => decrypt(channel.accessTokenEnc, encKey);

  return {
    sendText: (to, text) =>
      postMessage(channel.phoneNumberId, token(), {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }),

    sendTemplate: (to, templateName, templateLanguage, templateParams) =>
      postMessage(channel.phoneNumberId, token(), {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: templateLanguage },
          components: templateParams
            ? [
                {
                  type: 'body',
                  parameters: Object.values(templateParams).map((value) => ({ type: 'text', text: value })),
                },
              ]
            : undefined,
        },
      }),

    // Media API, 1ª etapa (design.md): GET /{media-id} -> URL temporária.
    getMediaUrl: async (mediaId) => {
      const res = await fetch(`${GRAPH_API_BASE}/${mediaId}`, { headers: { Authorization: `Bearer ${token()}` } });
      if (!res.ok) throw new MetaApiError(`Falha ao resolver URL de mídia (status ${res.status})`, res.status);

      const data = (await res.json()) as MetaMediaLookupResponse;
      return { url: data.url, mimeType: data.mime_type };
    },

    // Media API, 2ª etapa: GET da URL temporária com o token do canal — nunca
    // grava o binário em storage próprio (Out of Scope do spec.md).
    downloadMedia: async (url) => {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token()}` } });
      if (!res.ok) throw new MetaApiError(`Falha ao baixar mídia (status ${res.status})`, res.status);

      const arrayBuffer = await res.arrayBuffer();
      return Buffer.from(arrayBuffer);
    },
  };
};
