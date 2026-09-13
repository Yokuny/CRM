import crypto from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AnthropicClient, AnthropicMessageParams, IngestInput, RunTurnOutcome } from '@crm/ai-kit';
import { runTurn, TOOL_DEFINITIONS } from '@crm/ai-kit';
import { Channel, FieldTemplate, FieldTemplateVersion } from '@crm/db';
import { collectToolCalls, type FakeCreateMessageMock } from '../runner/expectTool.js';

// OPS-17: formato de um transcript sintético (mesmo espírito do golden set,
// design.md) — `messages` é a sequência de mensagens do cliente NESTA
// conversa (uma por turno, na ordem); `expectedTools` é a lista de tools que
// este transcript espera exercitar, checada estaticamente contra
// TOOL_DEFINITIONS ANTES de rodar (OPS-21) — nunca uma asserção de
// comportamento em si, só um contrato de "este sample ainda faz sentido".
export type ReplayTranscript = {
  name: string;
  messages: string[];
  expectedTools: string[];
};

export type ReplayToolCall = { tool: string; order: number };

export type ReplayReport =
  | { name: string; status: 'stale'; unknownTools: string[] }
  | { name: string; status: 'baseline_written'; toolCalls: ReplayToolCall[]; finalText: string }
  | { name: string; status: 'match'; toolCalls: ReplayToolCall[]; finalText: string }
  | {
      name: string;
      status: 'diverged';
      toolCalls: ReplayToolCall[];
      finalText: string;
      baselineToolCalls: ReplayToolCall[];
    };

export type RunReplayDeps = { createMessage: AnthropicClient['createMessage'] };

const randomId = (): string => crypto.randomBytes(12).toString('hex');
const randomPhone = (): string => `119${crypto.randomInt(10000000, 99999999)}`;

// Fixture mínima (Tenant/Channel/Customer-template/Process-template), molde
// de evals/cases/happyPath.int.test.ts — isolada por transcript (ids
// aleatórios), suficiente para qualquer sequência do Anel A que um client
// (fake ou real) decida exercitar num turno de replay.
const seedFixture = async (): Promise<{ phoneNumberId: string; from: string }> => {
  const tenant = randomId();
  const phoneNumberId = randomId();
  const from = randomPhone();

  await FieldTemplate.create({
    Tenant: tenant,
    targetType: 'customer',
    key: 'cliente',
    name: 'Cliente',
    currentVersion: 1,
    archived: false,
  });
  const processTemplate = await FieldTemplate.create({
    Tenant: tenant,
    targetType: 'process',
    key: 'orcamento',
    name: 'Orçamento',
    currentVersion: 1,
    archived: false,
  });
  await FieldTemplateVersion.create({
    Tenant: tenant,
    template: processTemplate._id,
    targetType: 'process',
    version: 1,
    fields: [{ fieldId: 'motivo', label: 'Motivo', type: 'text', required: true }],
    stages: ['novo', 'em_andamento', 'fechado'],
  });
  await Channel.create({
    Tenant: tenant,
    phoneNumberId,
    accessTokenEnc: { ciphertext: 'c', iv: 'i', authTag: 'a' },
    status: 'active',
  });

  return { phoneNumberId, from };
};

// Envelopa `deps.createMessage` (real OU fake — cli.ts injeta o client REAL,
// o teste de plumbing injeta um FAKE) num recorder com a MESMA forma que
// `collectToolCalls` (evals/runner/expectTool.ts) já espera — reuso literal
// do helper do golden set, sem depender de `deps.createMessage` já ser um
// `vi.fn()` (nunca é, no caminho real do cli.ts).
const createRecordingClient = (
  createMessage: AnthropicClient['createMessage'],
): AnthropicClient & FakeCreateMessageMock => {
  const calls: [AnthropicMessageParams][] = [];
  return {
    createMessage: async (params) => {
      calls.push([params]);
      return createMessage(params);
    },
    mock: { calls },
  };
};

const extractReply = (outcome: RunTurnOutcome): string =>
  outcome.outcome === 'sent' || outcome.outcome === 'fallback' ? outcome.reply : '';

const baselineFilePath = (baselineDir: string, name: string): string => path.join(baselineDir, `${name}.json`);

const readBaseline = async (baselineDir: string, name: string): Promise<ReplayToolCall[] | undefined> => {
  try {
    const raw = await readFile(baselineFilePath(baselineDir, name), 'utf8');
    return (JSON.parse(raw) as { toolCalls: ReplayToolCall[] }).toolCalls;
  } catch {
    return undefined;
  }
};

const writeBaseline = async (baselineDir: string, name: string, toolCalls: ReplayToolCall[]): Promise<void> => {
  await mkdir(baselineDir, { recursive: true });
  await writeFile(baselineFilePath(baselineDir, name), JSON.stringify({ toolCalls }, null, 2));
};

const sameToolCalls = (a: ReplayToolCall[], b: ReplayToolCall[]): boolean => JSON.stringify(a) === JSON.stringify(b);

const runOneTranscript = async (
  transcript: ReplayTranscript,
  deps: RunReplayDeps,
  baselineDir: string,
): Promise<ReplayReport> => {
  const { phoneNumberId, from } = await seedFixture();
  const client = createRecordingClient(deps.createMessage);

  let lastOutcome: RunTurnOutcome | undefined;
  for (const text of transcript.messages) {
    const input: IngestInput = {
      phoneNumberId,
      wamid: `wamid-replay-${randomId()}`,
      from,
      type: 'text',
      text,
    };
    lastOutcome = await runTurn(client, input);
  }

  const toolCalls: ReplayToolCall[] = collectToolCalls(client).map((call, index) => ({
    tool: call.name,
    order: index,
  }));
  const finalText = lastOutcome ? extractReply(lastOutcome) : '';

  const baseline = await readBaseline(baselineDir, transcript.name);
  if (!baseline) {
    await writeBaseline(baselineDir, transcript.name, toolCalls);
    return { name: transcript.name, status: 'baseline_written', toolCalls, finalText };
  }

  // OPS-18: divergência é SÓ de estrutura (nome/ordem de tool) — nunca do
  // texto final (ADR-0013: correção nunca depende de LLM-judge/texto exato).
  if (!sameToolCalls(baseline, toolCalls)) {
    return { name: transcript.name, status: 'diverged', toolCalls, finalText, baselineToolCalls: baseline };
  }

  return { name: transcript.name, status: 'match', toolCalls, finalText };
};

// OPS-17/18/19/21: processa um lote de transcripts contra `runTurn` real —
// nunca aborta o lote inteiro por causa de um transcript quebrado (`stale`,
// OPS-21). `deps.createMessage` é o único ponto de injeção: o teste de
// plumbing injeta um FAKE determinístico, cli.ts (T13) injeta o client REAL.
export const runReplay = async (
  transcripts: ReplayTranscript[],
  deps: RunReplayDeps,
  baselineDir: string,
): Promise<ReplayReport[]> => {
  const knownTools = new Set(TOOL_DEFINITIONS.map((t) => t.name));
  const reports: ReplayReport[] = [];

  for (const transcript of transcripts) {
    const unknownTools = transcript.expectedTools.filter((t) => !knownTools.has(t));
    if (unknownTools.length > 0) {
      reports.push({ name: transcript.name, status: 'stale', unknownTools });
      continue;
    }

    reports.push(await runOneTranscript(transcript, deps, baselineDir));
  }

  return reports;
};
