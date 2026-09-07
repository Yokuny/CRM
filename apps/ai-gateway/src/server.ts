import type { Server } from 'node:http';
import { pathToFileURL } from 'node:url';
import { connect } from '@crm/db';
import { buildApp } from './app.js';
import { env } from './config/env.config.js';
import { startIdleTakeoverSweep } from './workers/idleTakeoverSweep.js';
import { startOutboxConsumer } from './workers/outboxConsumer.js';
import { startReaper } from './workers/reaper.js';

// `opts` existe só para permitir que o e2e teste (T32) injete uma porta
// efêmera (0) e intervalos curtos para os 3 workers, sem esperar os defaults
// de produção (2s/30s/60s, design.md) — chamado sem argumentos (isMainModule
// abaixo), start() usa exatamente esses defaults.
export type StartOptions = {
  port?: number;
  outboxIntervalMs?: number;
  reaperIntervalMs?: number;
  reaperStaleAfterMs?: number;
  idleIntervalMs?: number;
  idleAfterMs?: number;
};

export type StartHandle = {
  httpServer: Server;
  stopWorkers: () => void;
};

// env → connect → listen → inicia os 3 workers de intervalo, com catch
// explícito. Mesmo padrão de fail-fast do crm-api (apps/crm-api/src/server.ts,
// T20): Mongo indisponível nunca deixa o processo de pé aceitando tráfego
// (FND-18).
export const start = async (opts: StartOptions = {}): Promise<StartHandle | undefined> => {
  try {
    await connect(env.MONGODB_URI);

    const app = buildApp();
    const port = opts.port ?? Number(env.AI_GATEWAY_PORT);
    const httpServer = app.listen(port, () => {
      console.log(JSON.stringify({ event: 'server.listening', port }));
    });

    const outbox = startOutboxConsumer({ encKey: env.CHANNEL_ENC_KEY }, opts.outboxIntervalMs);
    const reaper = startReaper(opts.reaperIntervalMs, opts.reaperStaleAfterMs);
    const idle = startIdleTakeoverSweep(opts.idleIntervalMs, opts.idleAfterMs);

    return {
      httpServer,
      stopWorkers: () => {
        outbox.stop();
        reaper.stop();
        idle.stop();
      },
    };
  } catch (e) {
    console.error(JSON.stringify({ event: 'server.boot_failed', message: e instanceof Error ? e.message : String(e) }));
    process.exit(1);
    return undefined;
  }
};

const isMainModule = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  void start();
}
