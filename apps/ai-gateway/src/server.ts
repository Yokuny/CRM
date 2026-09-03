import { pathToFileURL } from 'node:url';
import { connect } from '@crm/db';
import { buildApp } from './app.js';
import { env } from './config/env.config.js';

// env → connect → listen, com catch explícito. Mesmo padrão de fail-fast do
// crm-api (apps/crm-api/src/server.ts, T20): Mongo indisponível nunca deixa o
// processo de pé aceitando tráfego (FND-18). Sem syncIndexes — este esqueleto
// não declara nenhum model próprio (design.md: "packages/db (só conexão)").
export const start = async (): Promise<void> => {
  try {
    await connect(env.MONGODB_URI);

    const app = buildApp();
    app.listen(Number(env.AI_GATEWAY_PORT), () => {
      console.log(JSON.stringify({ event: 'server.listening', port: env.AI_GATEWAY_PORT }));
    });
  } catch (e) {
    console.error(JSON.stringify({ event: 'server.boot_failed', message: e instanceof Error ? e.message : String(e) }));
    process.exit(1);
  }
};

const isMainModule = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  void start();
}
