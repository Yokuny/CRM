import { pathToFileURL } from 'node:url';
import { connect, syncIndexes } from '@crm/db';
import { buildApp } from './app.js';
import { env } from './config/env.config.js';

// env → connect → syncIndexes → listen, com catch explícito. Mongo
// indisponível nunca deixa o processo de pé aceitando tráfego (FND-18).
export const start = async (): Promise<void> => {
  try {
    await connect(env.MONGODB_URI);
    await syncIndexes();

    const app = buildApp();
    app.listen(Number(env.CRM_API_PORT), () => {
      console.log(JSON.stringify({ event: 'server.listening', port: env.CRM_API_PORT }));
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
