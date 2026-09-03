import { defineConfig } from 'vitest/config';

// Valores de fallback para apps/crm-api/src/config/env.config.ts, cujo `env` é
// validado no IMPORT do módulo (fail-fast — FND-18). Sem isso, qualquer teste
// que importe (direta ou transitivamente) esse módulo falharia na coleta, já
// que o processo do Vitest não carrega o .env real.
// Compartilhado entre os projects que fazem import (direto ou transitivo) de
// apps/crm-api/src/config/env.config.ts E/OU apps/ai-gateway/src/config/env.config.ts
// — ambos validados por Zod no import do módulo (fail-fast, FND-18).
const crmApiBaseEnv = {
  NODE_ENV: 'test',
  CRM_API_PORT: '8080',
  SESSION_JWT_SECRET: 'test-secret',
  CORS_ORIGIN: 'http://localhost:5173',
  MAIL_PROVIDER: 'log',
  AI_GATEWAY_PORT: '8081',
};

// unit/e2e/structural não têm globalSetup — precisam de um MONGODB_URI
// estático só para o parse do env não falhar (nenhum desses projects conecta
// no Mongo de verdade).
const crmApiTestEnv = { ...crmApiBaseEnv, MONGODB_URI: 'mongodb://localhost:27017/crm-test' };

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/**/*.unit.test.ts', 'apps/*/src/**/*.unit.test.ts', 'apps/*/src/**/*.unit.test.tsx'],
          passWithNoTests: true,
          env: crmApiTestEnv,
        },
      },
      {
        test: {
          name: 'integration',
          include: [
            'packages/db/src/**/*.int.test.ts',
            'apps/crm-api/src/**/*.int.test.ts',
            'apps/crm-api/tests/**/*.int.test.ts',
          ],
          passWithNoTests: true,
          globalSetup: ['packages/db/tests/setup/globalSetup.ts'],
          // Sem MONGODB_URI aqui de propósito: o globalSetup injeta a URI real
          // do MongoMemoryServer em process.env antes de qualquer teste rodar
          // (ver packages/db/tests/setup/globalSetup.ts) — sobrescrever com um
          // valor estático quebraria a conexão real dos testes de integração.
          env: crmApiBaseEnv,
          // Todos os arquivos de integração compartilham UMA única instância
          // do MongoMemoryServer (injetada pelo globalSetup acima). Rodar os
          // arquivos em paralelo faz o afterEach/afterAll de um arquivo
          // (deleteMany global) apagar dados que outro arquivo, em execução
          // concorrente, acabou de escrever — falso 401/403 intermitente.
          // Descoberto ao adicionar platform.router.int.test.ts (T21), que
          // tornou a corrida praticamente sempre reprodutível. Corrigido aqui
          // (infra compartilhada), não nos testes.
          fileParallelism: false,
        },
      },
      {
        test: {
          name: 'e2e',
          include: ['apps/*/src/**/*.e2e.test.ts'],
          passWithNoTests: true,
          globalSetup: ['packages/db/tests/setup/globalSetup.ts'],
          // Sem MONGODB_URI aqui de propósito — mesmo motivo do project
          // "integration": o globalSetup injeta a URI real do
          // MongoMemoryServer antes de qualquer teste rodar.
          env: crmApiBaseEnv,
          // Mesma razão do project "integration": arquivos de e2e
          // compartilham UMA instância de MongoMemoryServer.
          fileParallelism: false,
        },
      },
      {
        test: {
          name: 'structural',
          include: ['tests/structural/*.structural.test.ts'],
          passWithNoTests: true,
          env: crmApiTestEnv,
        },
      },
    ],
  },
});
