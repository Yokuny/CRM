import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Porta 5173 casa com CORS_ORIGIN do crm-api (.env.example) — o back-end só
// aceita credentials:'include' dessa origem. envDir aponta pro .env único da
// raiz do monorepo (mesmo arquivo que crm-api/ai-gateway leem via
// process.env) — sem isso, client.api.ts não encontra VITE_API_URL e toda
// chamada falha com "Não foi possível conectar ao servidor".
export default defineConfig({
  plugins: [react()],
  envDir: '../../',
  server: { port: 5173 },
});
