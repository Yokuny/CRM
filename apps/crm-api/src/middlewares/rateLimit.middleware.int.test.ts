import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from './errorHandler.middleware.js';
import { inviteRateLimit, signinRateLimit } from './rateLimit.middleware.js';

const LIMIT = 5;

type MinimalResponse = { status: number; body: { success: boolean; message?: string } };

describe('signinRateLimit (FND-14)', () => {
  it('responds 429 with a readable pt-BR message once the same e-mail exceeds the limit within the window', async () => {
    const app = express();
    app.use(express.json());
    app.post('/signin', signinRateLimit, (_req, res) => {
      res.json({ success: true });
    });
    app.use(errorHandler);

    let last: MinimalResponse | undefined;
    for (let i = 0; i < LIMIT + 1; i++) {
      last = await request(app).post('/signin').send({ email: 'user@example.com', password: 'x' });
    }

    expect(last?.status).toBe(429);
    expect(last?.body).toEqual({ success: false, message: expect.stringMatching(/login/i) });
  });
});

describe('inviteRateLimit (FND-14)', () => {
  it('responds 429 with a readable pt-BR message once the same e-mail exceeds the limit within the window', async () => {
    const app = express();
    app.use(express.json());
    app.post('/invite', inviteRateLimit, (_req, res) => {
      res.json({ success: true });
    });
    app.use(errorHandler);

    let last: MinimalResponse | undefined;
    for (let i = 0; i < LIMIT + 1; i++) {
      last = await request(app).post('/invite').send({ email: 'convidado@example.com', role: 'operador' });
    }

    expect(last?.status).toBe(429);
    expect(last?.body).toEqual({ success: false, message: expect.stringMatching(/convite/i) });
  });
});
