import crypto from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type Anthropic from '@anthropic-ai/sdk';
import type { AnthropicClient, AnthropicMessage } from '@crm/ai-kit';
import { connect, disconnect } from '@crm/db';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type ReplayTranscript, runReplay } from './runReplay.js';

// Teste de PLUMBING (design.md Component 5): client Anthropic FAKE
// determinístico (NUNCA a SDK real) — valida leitura de sample/gravação de
// baseline/formato do relatório/lote com transcript quebrado, nunca
// comportamento real de modelo algum (ADR-0013). Molde de
// evals/cases/happyPath.int.test.ts para o client fake e o fixture bootstrap
// (feito dentro de runReplay.ts, reusado por runOneTranscript).
type FakeContent = { type: string; text?: string; id?: string; name?: string; input?: unknown };
type FakeResponse = { content: FakeContent[]; stop_reason: string };

const endTurn = (text: string): FakeResponse => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn' });
const toolUse = (id: string, name: string, input: unknown): FakeResponse => ({
  content: [{ type: 'tool_use', id, name, input }],
  stop_reason: 'tool_use',
});

const lastToolResult = (messages: Anthropic.MessageParam[]): Record<string, unknown> => {
  const last = messages.at(-1);
  if (last?.role !== 'user' || !Array.isArray(last.content)) {
    throw new Error('esperava um tool_result no histórico');
  }
  const block = last.content.find(
    (b): b is Anthropic.ToolResultBlockParam =>
      typeof b === 'object' && b !== null && 'type' in b && b.type === 'tool_result',
  );
  if (!block || typeof block.content !== 'string') throw new Error('tool_result inesperado');
  return JSON.parse(block.content) as Record<string, unknown>;
};

const FINAL_TEXT = 'Prontinho! Abri seu processo e já registrei os dados.';

// Mesma sequência de 3 tools do golden set happy path (find_or_create_customer
// → open_process → set_process_fields), compatível com o fixture semeado por
// runReplay.ts (template "cliente" + processo "orcamento"/"motivo").
const createHappyPathClient = (phone: string): AnthropicClient => {
  let step = 0;
  return {
    createMessage: vi.fn(async ({ messages }: { messages: Anthropic.MessageParam[] }) => {
      step++;
      if (step === 1) return toolUse('call-1', 'find_or_create_customer', { phone }) as unknown as AnthropicMessage;
      if (step === 2) {
        const { customerId } = lastToolResult(messages) as { customerId: string };
        return toolUse('call-2', 'open_process', {
          templateKey: 'orcamento',
          customerId,
        }) as unknown as AnthropicMessage;
      }
      if (step === 3) {
        const { processId } = lastToolResult(messages) as { processId: string };
        return toolUse('call-3', 'set_process_fields', {
          processId,
          values: { motivo: 'Solicitação via WhatsApp' },
        }) as unknown as AnthropicMessage;
      }
      return endTurn(FINAL_TEXT) as unknown as AnthropicMessage;
    }),
  };
};

// Client deliberadamente DIFERENTE (só cadastra o cliente, nunca abre
// processo) — usado só para provar que runReplay sinaliza divergência
// estrutural (OPS-18), nunca para simular comportamento real de modelo.
const createDivergedClient = (phone: string): AnthropicClient => {
  let step = 0;
  return {
    createMessage: vi.fn(async () => {
      step++;
      if (step === 1) return toolUse('call-1', 'find_or_create_customer', { phone }) as unknown as AnthropicMessage;
      return endTurn('Só cadastrei o cliente, nada mais.') as unknown as AnthropicMessage;
    }),
  };
};

const exampleTranscript = async (): Promise<ReplayTranscript> => {
  const raw = await readFile(fileURLToPath(new URL('./samples/example.json', import.meta.url)), 'utf8');
  return JSON.parse(raw) as ReplayTranscript;
};

describe('runReplay (OPS-17/18/19/21, replay pipeline scaffolding)', () => {
  let baselineDir: string;

  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
  });

  afterAll(async () => {
    await disconnect();
  });

  it('writes an initial baseline and reports the ordered tool calls + final text, no divergence (OPS-17, OPS-19)', async () => {
    baselineDir = await mkdtemp(path.join(os.tmpdir(), 'replay-baseline-'));
    const transcript = await exampleTranscript();
    const phone = `119${crypto.randomInt(10000000, 99999999)}`;
    const client = createHappyPathClient(phone);

    const [report] = await runReplay([transcript], { createMessage: client.createMessage }, baselineDir);

    expect(report).toEqual({
      name: 'example',
      status: 'baseline_written',
      toolCalls: [
        { tool: 'find_or_create_customer', order: 0 },
        { tool: 'open_process', order: 1 },
        { tool: 'set_process_fields', order: 2 },
      ],
      finalText: FINAL_TEXT,
    });

    const written = JSON.parse(await readFile(path.join(baselineDir, 'example.json'), 'utf8'));
    expect(written).toEqual({
      toolCalls: [
        { tool: 'find_or_create_customer', order: 0 },
        { tool: 'open_process', order: 1 },
        { tool: 'set_process_fields', order: 2 },
      ],
    });

    await rm(baselineDir, { recursive: true, force: true });
  });

  it('reports a transcript as diverged when the tool sequence differs from the stored baseline, comparing structure only (OPS-18)', async () => {
    baselineDir = await mkdtemp(path.join(os.tmpdir(), 'replay-baseline-'));
    const transcript = await exampleTranscript();
    const firstPhone = `119${crypto.randomInt(10000000, 99999999)}`;
    const secondPhone = `119${crypto.randomInt(10000000, 99999999)}`;

    // 1ª execução: grava a baseline (3 tools).
    await runReplay([transcript], { createMessage: createHappyPathClient(firstPhone).createMessage }, baselineDir);

    // 2ª execução: client DIFERENTE (1 tool só) — mesmo transcript/baseline.
    const [report] = await runReplay(
      [transcript],
      { createMessage: createDivergedClient(secondPhone).createMessage },
      baselineDir,
    );

    expect(report.status).toBe('diverged');
    if (report.status !== 'diverged') throw new Error('esperava status diverged');
    expect(report.toolCalls).toEqual([{ tool: 'find_or_create_customer', order: 0 }]);
    expect(report.baselineToolCalls).toEqual([
      { tool: 'find_or_create_customer', order: 0 },
      { tool: 'open_process', order: 1 },
      { tool: 'set_process_fields', order: 2 },
    ]);
    // OPS-18: a comparação nunca depende do texto final — só da estrutura.
    expect(report.finalText).toBe('Só cadastrei o cliente, nada mais.');

    await rm(baselineDir, { recursive: true, force: true });
  });

  it('marks a transcript referencing an unknown tool as stale and still processes the rest of the batch (OPS-21)', async () => {
    baselineDir = await mkdtemp(path.join(os.tmpdir(), 'replay-baseline-'));
    const workingTranscript = await exampleTranscript();
    const staleTranscript: ReplayTranscript = {
      name: 'broken-sample',
      messages: ['oi'],
      expectedTools: ['not_a_real_tool'],
    };
    const phone = `119${crypto.randomInt(10000000, 99999999)}`;

    const reports = await runReplay(
      [staleTranscript, workingTranscript],
      { createMessage: createHappyPathClient(phone).createMessage },
      baselineDir,
    );

    expect(reports[0]).toEqual({ name: 'broken-sample', status: 'stale', unknownTools: ['not_a_real_tool'] });
    expect(reports[1].status).toBe('baseline_written');
    expect(reports[1].name).toBe('example');

    await rm(baselineDir, { recursive: true, force: true });
  });
});
