import type Anthropic from '@anthropic-ai/sdk';
import type { AnthropicMessageParams } from '@crm/ai-kit';
import { expect } from 'vitest';

// Golden set (ADR-0013/AD-013): asserções sobre comportamento OBSERVÁVEL do
// harness real (runTurn contra MongoMemoryServer), nunca sobre texto do
// modelo. `expectTool`/`expectNoTool` inspecionam o client Anthropic FAKE
// injetado (nunca a SDK real — mesmo client de runTurn.int.test.ts) para
// confirmar quais tools o loop (packages/ai-kit/src/loop.ts) realmente
// despachou, com quais argumentos, e quais tools foram OFERECIDAS ao modelo
// em cada chamada (o `tools:` de AnthropicMessageParams, sempre
// TOOL_DEFINITIONS — superfície fixa do Anel A, ADR-0010).
//
// SPEC_DEVIATION: ADR-0013 (2026-09-02) descrevia `evals/cases/*.yaml`
// rodando contra um parser/DSL próprio. AD-015 (mesmo dia) já fixava Vitest
// como o ÚNICO test runner do monorepo, incluindo `evals/` — e tasks.md
// (T43-T45, autoridade posterior para esta feature) usa `.int.test.ts`
// literal. `expectTool`/`expectNoTool`/`expectNoLeak` são funções helper
// Vitest normais, não uma DSL YAML.
export type FakeCreateMessageMock = {
  mock: { calls: [AnthropicMessageParams][] };
};

export type ToolCallLog = { name: string; input: Record<string, unknown> };

const deepEqual = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

// O `messages` da ÚLTIMA chamada já contém o transcript acumulado do turno
// inteiro (loop.ts sempre reenvia o array crescente) — não precisa somar as
// chamadas anteriores.
const lastMessages = (mock: FakeCreateMessageMock): Anthropic.MessageParam[] => {
  const lastCall = mock.mock.calls.at(-1)?.[0];
  return lastCall?.messages ?? [];
};

export const collectToolCalls = (mock: FakeCreateMessageMock): ToolCallLog[] => {
  const calls: ToolCallLog[] = [];
  for (const message of lastMessages(mock)) {
    if (message.role !== 'assistant' || !Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (typeof block === 'object' && block !== null && 'type' in block && block.type === 'tool_use') {
        const toolUse = block as Anthropic.ToolUseBlock;
        calls.push({ name: toolUse.name, input: (toolUse.input ?? {}) as Record<string, unknown> });
      }
    }
  }
  return calls;
};

// Superfície oferecida ao modelo (o `tools:` de cada chamada) — nunca varia
// por turno (sempre TOOL_DEFINITIONS, loop.ts), mas conferir aqui prova a
// garantia a partir do dado OBSERVÁVEL do turno, não de uma suposição.
export const collectOfferedToolNames = (mock: FakeCreateMessageMock): string[] => {
  const names = new Set<string>();
  for (const [params] of mock.mock.calls) {
    for (const tool of params.tools ?? []) names.add(tool.name);
  }
  return [...names];
};

export const expectTool = (mock: FakeCreateMessageMock, name: string, inputMatch?: Record<string, unknown>): void => {
  const calls = collectToolCalls(mock);
  const match = calls.find(
    (c) => c.name === name && (!inputMatch || Object.entries(inputMatch).every(([k, v]) => deepEqual(c.input[k], v))),
  );
  expect(
    match,
    `esperava uma chamada à tool "${name}"${inputMatch ? ` com ${JSON.stringify(inputMatch)}` : ''} — chamadas observadas: ${JSON.stringify(calls)}`,
  ).toBeDefined();
};

export const expectNoTool = (mock: FakeCreateMessageMock, name: string): void => {
  expect(collectOfferedToolNames(mock), `"${name}" nunca deveria ser oferecida ao modelo`).not.toContain(name);
  expect(
    collectToolCalls(mock).some((c) => c.name === name),
    `"${name}" nunca deveria ser chamada`,
  ).toBe(false);
};
