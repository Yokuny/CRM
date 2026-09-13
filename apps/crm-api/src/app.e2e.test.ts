import { connect, disconnect } from '@crm/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

// OPS-03/04/05: GET /metrics expõe register.metrics() (prom-client) sem
// validToken (mesmo padrão não-autenticado de /health — apps/ai-gateway/src/app.e2e.test.ts).
// dbReqResTime/reqResTime já são registrados no `register` default no import
// de db.metric.ts/responseTime.middleware.ts — nenhuma métrica nova criada.
//
// Ordem dos testes importa aqui: o `register` do prom-client é um singleton
// por arquivo (module cache do Vitest); o teste de OPS-05 (histogramas vazios)
// precisa ser a PRIMEIRA requisição do arquivo para provar "antes de qualquer
// request ter passado pelo responseTime" — os testes seguintes já vão
// encontrar séries populadas pelas chamadas anteriores, o que não invalida
// OPS-03/04 (que só verificam presença dos nomes de métrica, não vacuidade).
describe('GET /metrics', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
  });

  afterAll(async () => {
    await disconnect();
  });

  it('OPS-05: responds 200 with empty histograms (no sample lines yet) on the very first request of the process', async () => {
    const res = await request(buildApp()).get('/metrics');

    expect(res.status).toBe(200);
    expect(res.text).toContain('# HELP http_request_duration_seconds');
    expect(res.text).toContain('# HELP db_operation_duration_seconds');
    // Nenhuma linha de amostra ainda (histogramas sem observações) — só
    // metadado HELP/TYPE, nunca dado de série.
    expect(res.text).not.toMatch(/http_request_duration_seconds_bucket\{/);
    expect(res.text).not.toMatch(/db_operation_duration_seconds_bucket\{/);
  });

  it('OPS-03: responds 200 with Content-Type text/plain; version=0.0.4; charset=utf-8 and includes the registered metric series', async () => {
    const res = await request(buildApp()).get('/metrics');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/plain; version=0.0.4; charset=utf-8');
    expect(res.text).toContain('db_operation_duration_seconds');
    expect(res.text).toContain('http_request_duration_seconds');
  });

  it('OPS-04: responds 200 with no Authorization header and no session cookie set (no validToken)', async () => {
    const res = await request(buildApp()).get('/metrics');

    expect(res.status).toBe(200);
  });
});
