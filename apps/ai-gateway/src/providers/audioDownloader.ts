import type { DownloadAudio } from '@crm/ai-kit';
import { createMetaClient } from './metaClient.js';

// P2 (T47, AIG-45): implementação REAL do `DownloadAudio` injetável que
// `packages/ai-kit/src/ingest.ts` só declara como TIPO — packages não podem
// importar de apps (direção de dependência errada), então a peça concreta
// que sabe falar com a Media API da Meta (metaClient.ts, T26, wrapper fino
// getMediaUrl→downloadMedia) vive aqui, no composition root de
// apps/ai-gateway, e é injetada em runTurn via webhook.router.ts. Mesmo
// molde de injeção de metaClient/whisperClient — todo teste injeta um fake,
// nunca esta implementação real.
export const createAudioDownloader = (encKey: string): DownloadAudio => {
  return async (channel, mediaId) => {
    const client = createMetaClient(channel, encKey);
    const { url, mimeType } = await client.getMediaUrl(mediaId);
    const buffer = await client.downloadMedia(url);
    return { buffer, mime: mimeType ?? 'audio/ogg' };
  };
};
