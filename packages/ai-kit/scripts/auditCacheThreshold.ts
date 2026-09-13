import { pathToFileURL } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT } from '../src/contextBuild.js';
import { TOOL_DEFINITIONS } from '../src/tools/toolDefinitions.js';

export type ThresholdResult = { overLimit: boolean; tokenCount: number; limit: number };

// AD-008: revisão do threshold de cache de prompt — o teto de cache
// automático da Anthropic é 4096 tokens (limit default); abaixo disso,
// `cache_control` explícito não traz benefício algum. Função pura, sem rede
// — testada com contagens sintéticas (OPS-14/15); a chamada real de
// contagem de tokens (abaixo) fica numa camada separada, fora deste boundary.
export const evaluateThreshold = (tokenCount: number, limit = 4096): ThresholdResult => ({
  overLimit: tokenCount >= limit,
  tokenCount,
  limit,
});

// AD-008: mesmo model ID usado pelo loop real (loop.ts MODEL) — sem sufixo
// de data. Duplicado aqui (não exportado por loop.ts) para não criar um
// acoplamento novo só por causa de uma constante de script sob demanda.
const MODEL = 'claude-haiku-4-5';

// OPS-13/OPS-16: chamada real de contagem de tokens (nunca em teste — a SDK
// real só é tocada aqui, fora de qualquer glob do Vitest). `evaluateThreshold`
// (acima) é o único ponto testado por unidade; este corpo é wiring fino,
// verificado por revisão de código + execução manual (Done-when de T9).
const run = async (): Promise<void> => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Falha de configuração: variável de ambiente ANTHROPIC_API_KEY ausente.');
    process.exit(1);
    return;
  }

  let tokenCount: number;
  try {
    const client = new Anthropic({ apiKey });
    const result = await client.messages.countTokens({
      model: MODEL,
      system: SYSTEM_PROMPT,
      tools: TOOL_DEFINITIONS,
      messages: [],
    });
    tokenCount = result.input_tokens;
  } catch (err) {
    console.error(`Falha de rede/configuração ao contar tokens: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
    return;
  }

  const { overLimit, limit } = evaluateThreshold(tokenCount);
  if (overLimit) {
    console.error(`Prompt + tools somam ${tokenCount} tokens (>= ${limit}) — revise cache_control explícito (AD-008).`);
    process.exit(1);
    return;
  }

  console.log(`Prompt + tools somam ${tokenCount} tokens (< ${limit}) — dentro do limiar de cache.`);
};

const isMainModule = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  void run();
}
