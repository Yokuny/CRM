import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Porta 5173 casa com CORS_ORIGIN do crm-api (.env.example) — o back-end só
// aceita credentials:'include' dessa origem. envDir aponta pro .env único da
// raiz do monorepo (mesmo arquivo que crm-api/ai-gateway leem via
// process.env) — sem isso, client.api.ts não encontra VITE_API_URL e toda
// chamada falha com "Não foi possível conectar ao servidor".
//
// tanstackRouter() PRECISA vir antes de react() (mesma ordem do front de
// referência) — o plugin reescreve as rotas antes do Babel/SWC do
// @vitejs/plugin-react processar os arquivos (AD-030).
export default defineConfig({
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true, routeFileIgnorePrefix: '@', semicolons: true }),
    react(),
    tailwindcss(),
  ],
  envDir: '../../',
  server: { port: 5173 },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});
