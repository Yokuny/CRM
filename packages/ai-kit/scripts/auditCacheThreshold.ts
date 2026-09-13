export type ThresholdResult = { overLimit: boolean; tokenCount: number; limit: number };

// AD-008: revisão do threshold de cache de prompt — o teto de cache
// automático da Anthropic é 4096 tokens (limit default); abaixo disso,
// `cache_control` explícito não traz benefício algum. Função pura, sem rede
// — testada com contagens sintéticas (OPS-14/15); a chamada real de
// contagem de tokens (T9) fica numa camada separada, fora deste boundary.
export const evaluateThreshold = (tokenCount: number, limit = 4096): ThresholdResult => ({
  overLimit: tokenCount >= limit,
  tokenCount,
  limit,
});
