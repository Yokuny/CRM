import { decrypt, type EncryptedSecret } from '@crm/db';

// Cliente fino e SÓ LEITURA da Media API da Meta Cloud API (design.md,
// Componente 5) — o `crm-api` nunca envia mensagem, isso é exclusividade do
// `ai-gateway` (AD-002/AD-007). Duplicação deliberada da metade de leitura de
// apps/ai-gateway/src/providers/metaClient.ts:96-113 (`getMediaUrl`/
// `downloadMedia`) — mesmo precedente já aceito em
// .specs/features/ai-gateway/design.md (linha 282, duplicação Customer/Process)
// e registrado em design.md (Risks & Concerns) desta feature. Qualquer
// mudança na Media API da Meta precisa ser replicada manualmente nos dois
// arquivos — comentado aqui e lá para reduzir o risco de divergência
// silenciosa.
const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export type MetaMediaUrlResult = { url: string; mimeType?: string };

export type MetaMediaChannel = {
  phoneNumberId: string;
  accessTokenEnc: EncryptedSecret;
};

export type MetaMediaClient = {
  getMediaUrl: (mediaId: string) => Promise<MetaMediaUrlResult>;
  downloadMedia: (url: string) => Promise<Buffer>;
};

// Mesmo erro tipado de metaClient.ts (nome idêntico, módulo diferente) — quem
// chama (getMessageMedia, T16) decide a tradução para HTTP a partir daqui,
// nunca um erro genérico.
export class MetaApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'MetaApiError';
    this.status = status;
  }
}

type MetaMediaLookupResponse = { url: string; mime_type?: string };

// Token do Channel decifrado (spec.md P2 AC2) só no escopo de CADA chamada —
// nunca cacheado em texto plano além disso, mesmo padrão de createMetaClient.
export const createMetaMediaClient = (channel: MetaMediaChannel, encKey: string): MetaMediaClient => {
  const token = (): string => decrypt(channel.accessTokenEnc, encKey);

  return {
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
