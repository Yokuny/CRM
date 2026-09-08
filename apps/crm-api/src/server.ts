import type { Server } from 'node:http';
import { pathToFileURL } from 'node:url';
import { connect, syncIndexes } from '@crm/db';
import { buildApp } from './app.js';
import { buildAuthDeps } from './authDeps.js';
import { env } from './config/env.config.js';
import { startInboxPoller } from './workers/inboxPoller.js';
import { createInboxSocketServer } from './ws/inboxSocket.js';

// `opts` existe só pra permitir que o e2e teste injete uma porta efêmera (0)
// e um intervalo curto do poller, sem esperar os defaults de produção —
// mesmo molde de apps/ai-gateway/src/server.ts (T25 lá, T6 aqui).
export type StartOptions = {
  port?: number;
  pollerIntervalMs?: number;
};

export type StartHandle = {
  httpServer: Server;
  stopWorkers: () => void;
};

// env → connect → syncIndexes → listen → anexa o InboxSocketServer (T4) e
// inicia o inboxPoller (T5) no MESMO httpServer, com catch explícito. Mongo
// indisponível nunca deixa o processo de pé aceitando tráfego (FND-18).
export const start = async (opts: StartOptions = {}): Promise<StartHandle | undefined> => {
  try {
    await connect(env.MONGODB_URI);
    await syncIndexes();

    const app = buildApp();
    const port = opts.port ?? Number(env.CRM_API_PORT);
    const httpServer = app.listen(port, () => {
      console.log(JSON.stringify({ event: 'server.listening', port }));
    });

    const socketServer = createInboxSocketServer(httpServer, buildAuthDeps());
    const poller = startInboxPoller(socketServer, opts.pollerIntervalMs);

    return {
      httpServer,
      stopWorkers: () => {
        poller.stop();
        socketServer.close();
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
