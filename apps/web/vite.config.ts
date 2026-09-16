import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { devtools } from '@tanstack/devtools-vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Porta 5173 casa com CORS_ORIGIN do crm-api (.env.example) — o back-end só
// aceita credentials:'include' dessa origem. envDir aponta pro .env único da
// raiz do monorepo (mesmo arquivo que crm-api/ai-gateway leem via
// process.env) — sem isso, client.api.ts não encontra VITE_API_URL e toda
// chamada falha com "Não foi possível conectar ao servidor".
//
// devtools() PRECISA ser o PRIMEIRO plugin (doc oficial) — instrumenta os
// outros plugins/transforms pra inspeção de fonte (go-to-source) e injeta o
// piping de console antes de qualquer outra transformação rodar.
// removeDevtoolsOnBuild (default true) já tira TanStackDevtools/painéis do
// bundle de produção sozinho — main.tsx importa/monta sem guard manual de
// import.meta.env.DEV.
//
// tanstackRouter() PRECISA vir antes de react() (mesma ordem do front de
// referência) — o plugin reescreve as rotas antes do Babel/SWC do
// @vitejs/plugin-react processar os arquivos (AD-030).
export default defineConfig({
  plugins: [
    devtools(),
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routeFileIgnorePrefix: '@',
      // *.unit.test.ts(x) fica lado a lado do arquivo de rota (não em @algo/)
      // — sem isso, o plugin avisa "does not export a Route" pra cada um
      // deles a cada build/dev (o aviso ignora --logLevel do Vite, sai
      // direto no stdout).
      routeFileIgnorePattern: '\\.unit\\.test\\.tsx?$',
      semicolons: true,
    }),
    react(),
    tailwindcss(),
  ],
  envDir: '../../',
  server: { port: 5173 },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});
