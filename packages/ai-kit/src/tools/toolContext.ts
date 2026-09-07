// Contexto injetado pelo servidor em toda tool do Anel A (design.md) — nunca
// vem do `input_schema`, nunca do modelo (AD-010). `channelId`/`conversationId`
// ainda não são lidos pelos executores desta fase, mas fazem parte do
// contrato fixo do ToolContext para as tools/etapas futuras (T18+).
export type ToolContext = {
  tenantId: string;
  channelId: string;
  conversationId: string;
};
