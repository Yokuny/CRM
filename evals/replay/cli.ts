import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createAnthropicClient } from '@crm/ai-kit';
import { connect, disconnect } from '@crm/db';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { type ReplayTranscript, runReplay } from './runReplay.js';

// OPS-22: entrypoint sob demanda (`tsx evals/replay/cli.ts`, script "replay"
// no package.json raiz) — NUNCA um arquivo `*.test.ts`, nunca referenciado
// por nenhum `include` de vitest.config.ts, então `pnpm run check` nunca o
// executa (design.md Tech Decisions). Client Anthropic REAL (nunca um fake
// aqui — só `runReplay.int.test.ts`, T12, usa fake) e Mongo efêmero
// (MongoMemoryServer própria, isolada da suíte de teste) — os dois únicos
// jeitos deste script tocar rede/estado de verdade, de propósito.
const SAMPLES_DIR = fileURLToPath(new URL('./samples', import.meta.url));
const BASELINES_DIR = fileURLToPath(new URL('./baselines', import.meta.url));

const readTranscripts = async (): Promise<ReplayTranscript[]> => {
  const entries = await readdir(SAMPLES_DIR);
  const files = entries.filter((entry) => entry.endsWith('.json'));
  return Promise.all(
    files.map(async (file) => JSON.parse(await readFile(path.join(SAMPLES_DIR, file), 'utf8')) as ReplayTranscript),
  );
};

// Risks & Concerns (design.md): baseline só é sobrescrita com `--update`
// explícito — uma divergência nunca vira baseline nova sozinha, precisa de
// revisão humana antes (ADR-0013).
const updateBaseline = async (name: string, toolCalls: unknown): Promise<void> => {
  await writeFile(path.join(BASELINES_DIR, `${name}.json`), JSON.stringify({ toolCalls }, null, 2));
};

const run = async (): Promise<void> => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Falha de configuração: variável de ambiente ANTHROPIC_API_KEY ausente.');
    process.exit(1);
    return;
  }
  const update = process.argv.includes('--update');

  const mongo = await MongoMemoryServer.create();
  await connect(mongo.getUri());

  try {
    const transcripts = await readTranscripts();
    const client = createAnthropicClient(apiKey);
    const reports = await runReplay(transcripts, { createMessage: client.createMessage }, BASELINES_DIR);

    let hasUnconfirmedDivergence = false;
    for (const report of reports) {
      console.log(JSON.stringify(report, null, 2));
      if (report.status !== 'diverged') continue;
      if (update) {
        await updateBaseline(report.name, report.toolCalls);
        console.log(`Baseline de "${report.name}" atualizada (--update).`);
      } else {
        hasUnconfirmedDivergence = true;
      }
    }

    if (hasUnconfirmedDivergence) {
      console.error('Divergência encontrada sem --update — revise o relatório antes de promover.');
      process.exit(1);
    }
  } finally {
    await disconnect();
    await mongo.stop();
  }
};

const isMainModule = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  void run();
}
