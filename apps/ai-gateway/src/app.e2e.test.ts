import { connect, disconnect } from '@crm/db';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

// AD-002: dois serviços sobre o mesmo Mongo — o ai-gateway também precisa
// responder /health desde a feature 1. MongoMemoryServer real (globalSetup do
// project e2e), mesmo padrão de apps/crm-api/src/routers/*.e2e.test.ts.
describe('GET /health', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
  });

  afterAll(async () => {
    await disconnect();
  });

  it('responds 200 with {success:true, data:{service:"ai-gateway", db:"up"}} with Mongo connected', async () => {
    const res = await request(buildApp()).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { service: 'ai-gateway', db: 'up' }, message: '' });
  });
});
