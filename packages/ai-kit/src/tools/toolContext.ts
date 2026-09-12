import type { AsaasClient } from '../providers/asaasClient.js';

// Contexto injetado pelo servidor em toda tool do Anel A (design.md) — nunca
// vem do `input_schema`, nunca do modelo (AD-010). `channelId`/`conversationId`
// ainda não são lidos pelos executores desta fase, mas fazem parte do
// contrato fixo do ToolContext para as tools/etapas futuras (T18+).
// `asaasClient` (payments-asaas T16): opcional, mesmo molde de
// `IngestOptions.downloadAudio` — `undefined` em todo teste/chamador que não
// injeta (comportamento idêntico ao P1 sem esta feature); só a tool
// `issue_payment_link` (T18) lê este campo.
// `webBaseUrl` (scheduling T27): mesmo molde de `asaasClient` — origem
// pública do `apps/web` usada para montar a URL de confirmação de
// agendamento; só a tool `book_appointment` lê este campo. Nenhum pacote lê
// `process.env` diretamente (design.md Research Provenance) — chega até
// aqui pelo seam `ai-gateway` → `webhook.router` → `runTurn` (T29).
export type ToolContext = {
  tenantId: string;
  channelId: string;
  conversationId: string;
  asaasClient?: AsaasClient;
  webBaseUrl?: string;
};
