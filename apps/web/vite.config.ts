import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Porta 5173 casa com CORS_ORIGIN do crm-api (.env.example) — o back-end só
// aceita credentials:'include' dessa origem.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
