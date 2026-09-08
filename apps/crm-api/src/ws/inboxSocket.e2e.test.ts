import crypto from 'node:crypto';
import http from 'node:http';
import { connect, disconnect, hashToken, Session, Tenant, User } from '@crm/db';
import cookieParser from 'cookie-parser';
import express from 'express';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { env } from '../config/env.config.js';
import type { AuthDeps } from '../middlewares/authentication.middleware.js';
import {
  createInboxSocketServer,
  extractHandshakeCookie,
  type InboxSocketServer,
  type InboxWsEvent,
} from './inboxSocket.js';

const DEVICE = 'e2e-agent';
const randomId = (): string => crypto.randomBytes(12).toString('hex');
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const waitUntil = async (predicate: () => boolean, timeoutMs = 2000): Promise<void> => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitUntil: timeout esperando a condição ficar verdadeira');
    await sleep(10);
  }
};

const waitForOpen = (socket: WebSocket): Promise<void> =>
  new Promise((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });

const waitForClose = (socket: WebSocket): Promise<{ code: number; reason: string }> =>
  new Promise((resolve) => {
    socket.once('close', (code, reason) => resolve({ code, reason: reason.toString() }));
  });

const waitForMessage = (socket: WebSocket, timeoutMs = 2000): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout esperando mensagem')), timeoutMs);
    socket.once('message', (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()));
    });
  });

// Confirma ausência de entrega dentro da janela — usado pra provar que
// unsubscribe/isolamento de sala realmente impede o recebimento (não é só
// "nenhum erro", é a AUSÊNCIA do dado que a UI usaria).
const expectNoMessage = (socket: WebSocket, ms = 250): Promise<void> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    socket.once('message', (data) => {
      clearTimeout(timer);
      reject(new Error(`mensagem inesperada recebida: ${data.toString()}`));
    });
  });

const buildAuthDeps = (): AuthDeps => ({
  findSessionByHash: async (tokenHash) => {
    const session = await Session.findOne({ tokenHash }).lean();
    return session ? { user: session.user.toString(), deviceInfo: session.deviceInfo } : null;
  },
  revokeAllSessions: async (userId) => {
    await Session.deleteMany({ user: userId });
  },
  getUserById: async (userId) => {
    const user = await User.findById(userId).lean();
    return user
      ? {
          id: user._id.toString(),
          tenant: user.Tenant?.toString(),
          role: user.role,
          isPlatformAdmin: user.isPlatformAdmin,
          active: user.active,
        }
      : null;
  },
  getTenantById: async (tenantId) => {
    const tenant = await Tenant.findById(tenantId).lean();
    return tenant ? { id: tenant._id.toString(), name: tenant.name, status: tenant.status } : null;
  },
});

const issueSessionCookie = async (userId: string): Promise<string> => {
  const rawToken = jwt.sign({ user: userId, jti: crypto.randomUUID() }, env.SESSION_JWT_SECRET);
  await Session.create({
    user: userId,
    tokenHash: hashToken(rawToken),
    deviceInfo: DEVICE,
    expiresAt: new Date(Date.now() + 3600_000),
  });
  return `refreshToken=${rawToken}`;
};

let seq = 0;
const seedTenantUser = async () => {
  seq += 1;
  const tenant = await Tenant.create({
    name: `Empresa ${seq}`,
    document: String(10000000000000 + seq),
    status: 'active',
  });
  const user = await User.create({
    name: 'Operador',
    email: `op-${seq}@empresa.com`,
    password: 'hash',
    Tenant: tenant._id,
    role: ['operador'],
  });
  const cookie = await issueSessionCookie(user.id);
  return { tenant, user, cookie };
};

type RunningServer = { httpServer: http.Server; socketServer: InboxSocketServer; port: number };

const startServer = (): Promise<RunningServer> => {
  const httpServer = http.createServer();
  const socketServer = createInboxSocketServer(httpServer, buildAuthDeps());
  return new Promise((resolve) => {
    httpServer.listen(0, () => {
      const address = httpServer.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ httpServer, socketServer, port });
    });
  });
};

// `ws` (client) não manda um header `User-Agent` por padrão — sem isso,
// `authenticateSession` (T2) sempre veria `deviceInfo:'unknown'` e nunca
// bateria com o `DEVICE` gravado por `issueSessionCookie`, derrubando toda
// sessão válida por "device mismatch" antes mesmo do teste chegar ao que
// realmente quer verificar.
const connectClient = (port: number, cookie?: string): WebSocket =>
  new WebSocket(`ws://127.0.0.1:${port}`, { headers: { 'User-Agent': DEVICE, ...(cookie ? { Cookie: cookie } : {}) } });

describe('createInboxSocketServer (T4)', () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
  });

  afterEach(async () => {
    if (server) {
      server.socketServer.close();
      await new Promise<void>((resolve) => server?.httpServer.close(() => resolve()));
      server = undefined;
    }
    await Promise.all([Session.deleteMany({}), User.deleteMany({}), Tenant.deleteMany({})]);
  });

  afterAll(async () => {
    await disconnect();
  });

  it('connects and joins the tenant room with a valid session cookie (successful handshake)', async () => {
    const { tenant, cookie } = await seedTenantUser();
    server = await startServer();
    const running = server;
    const client = connectClient(running.port, cookie);
    await waitForOpen(client);

    await waitUntil(() => running.socketServer.getConnectedTenantIds().includes(tenant.id));

    const event: InboxWsEvent = {
      type: 'conversation.updated',
      conversationId: 'conv-1',
      lastActivityAt: new Date().toISOString(),
      unread: true,
    };
    running.socketServer.broadcastToTenant(tenant.id, event);

    await expect(waitForMessage(client)).resolves.toEqual(event);
    client.close();
  });

  it('closes with code 4401 and joins no room when no cookie is provided (missing credential)', async () => {
    server = await startServer();
    const running = server;
    const client = connectClient(running.port);
    await waitForOpen(client);

    const { code } = await waitForClose(client);

    expect(code).toBe(4401);
    expect(running.socketServer.getConnectedTenantIds()).toEqual([]);
  });

  it('closes with code 4401 for an invalid/unknown session cookie (bad credential)', async () => {
    server = await startServer();
    const running = server;
    const client = connectClient(running.port, 'refreshToken=not-a-real-session-token');
    await waitForOpen(client);

    const { code } = await waitForClose(client);

    expect(code).toBe(4401);
    expect(running.socketServer.getConnectedTenantIds()).toEqual([]);
  });

  it('subscribe/unsubscribe join and leave the tenant:<id>:conversation:<id> room', async () => {
    const { tenant, cookie } = await seedTenantUser();
    server = await startServer();
    const running = server;
    const client = connectClient(running.port, cookie);
    await waitForOpen(client);
    await waitUntil(() => running.socketServer.getConnectedTenantIds().includes(tenant.id));

    client.send(JSON.stringify({ type: 'subscribe', conversationId: 'conv-42' }));
    await sleep(100);

    const event: InboxWsEvent = {
      type: 'message.new',
      conversationId: 'conv-42',
      message: {
        id: randomId(),
        conversationId: 'conv-42',
        direction: 'in',
        type: 'text',
        text: 'oi',
        createdAt: new Date().toISOString(),
      },
    };
    running.socketServer.broadcastToConversation(tenant.id, 'conv-42', event);
    await expect(waitForMessage(client)).resolves.toEqual(event);

    client.send(JSON.stringify({ type: 'unsubscribe', conversationId: 'conv-42' }));
    await sleep(100);

    running.socketServer.broadcastToConversation(tenant.id, 'conv-42', event);
    await expectNoMessage(client);

    client.close();
  });

  it('broadcastToConversation only reaches sockets in the exact tenant+conversation room; broadcastToTenant never leaks across tenants', async () => {
    const a = await seedTenantUser();
    const b = await seedTenantUser();
    server = await startServer();
    const running = server;
    const clientA = connectClient(running.port, a.cookie);
    const clientB = connectClient(running.port, b.cookie);
    await Promise.all([waitForOpen(clientA), waitForOpen(clientB)]);
    await waitUntil(
      () =>
        running.socketServer.getConnectedTenantIds().includes(a.tenant.id) &&
        running.socketServer.getConnectedTenantIds().includes(b.tenant.id),
    );

    // Mesmo conversationId literal em tenants DIFERENTES — a sala é
    // tenant:<id>:conversation:<id>, então isso nunca deveria colidir.
    clientA.send(JSON.stringify({ type: 'subscribe', conversationId: 'shared-id' }));
    clientB.send(JSON.stringify({ type: 'subscribe', conversationId: 'shared-id' }));
    await sleep(100);

    const conversationEvent: InboxWsEvent = {
      type: 'message.new',
      conversationId: 'shared-id',
      message: {
        id: randomId(),
        conversationId: 'shared-id',
        direction: 'in',
        type: 'text',
        text: 'só pra A',
        createdAt: new Date().toISOString(),
      },
    };
    running.socketServer.broadcastToConversation(a.tenant.id, 'shared-id', conversationEvent);
    await expect(waitForMessage(clientA)).resolves.toEqual(conversationEvent);
    await expectNoMessage(clientB);

    const tenantEvent: InboxWsEvent = {
      type: 'conversation.updated',
      conversationId: 'shared-id',
      lastActivityAt: new Date().toISOString(),
      unread: false,
    };
    running.socketServer.broadcastToTenant(a.tenant.id, tenantEvent);
    await expect(waitForMessage(clientA)).resolves.toEqual(tenantEvent);
    await expectNoMessage(clientB);

    clientA.close();
    clientB.close();
  });

  it('disconnection removes the socket from every room it participated in — no reference leak', async () => {
    const { tenant, cookie } = await seedTenantUser();
    server = await startServer();
    const running = server;
    const client = connectClient(running.port, cookie);
    await waitForOpen(client);
    await waitUntil(() => running.socketServer.getConnectedTenantIds().includes(tenant.id));

    client.close();

    await waitUntil(() => !running.socketServer.getConnectedTenantIds().includes(tenant.id));
    expect(running.socketServer.getConnectedTenantIds()).toEqual([]);
  });

  it('logs structured ws.connected/ws.disconnected/ws.auth_failed events (INBOX-19)', async () => {
    const { tenant, cookie } = await seedTenantUser();
    server = await startServer();
    const running = server;
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const goodClient = connectClient(running.port, cookie);
    await waitForOpen(goodClient);
    await waitUntil(() => running.socketServer.getConnectedTenantIds().includes(tenant.id));
    const connectedLog = logSpy.mock.calls
      .map(([arg]) => JSON.parse(arg as string))
      .find((l) => l.event === 'ws.connected');
    expect(connectedLog).toEqual({ event: 'ws.connected', tenantId: tenant.id });

    goodClient.close();
    await waitUntil(() => !running.socketServer.getConnectedTenantIds().includes(tenant.id));
    const disconnectedLog = logSpy.mock.calls
      .map(([arg]) => JSON.parse(arg as string))
      .find((l) => l.event === 'ws.disconnected');
    expect(disconnectedLog).toEqual({ event: 'ws.disconnected', tenantId: tenant.id });

    const badClient = connectClient(running.port);
    await waitForOpen(badClient);
    await waitForClose(badClient);
    const authFailedLog = errorSpy.mock.calls
      .map(([arg]) => JSON.parse(arg as string))
      .find((l) => l.event === 'ws.auth_failed');
    expect(authFailedLog?.event).toBe('ws.auth_failed');

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

// design.md Risks & Concerns: "parsing usa a lib `cookie` (mesma base de
// `cookie-parser`) com teste unitário comparando o resultado com o
// middleware Express no mesmo cookie" — prova que o parsing manual do
// handshake WS (sem `cookieParser()`, que nunca roda no evento `upgrade`)
// nunca diverge do que o pipeline HTTP normal já resolve para o MESMO
// header cru.
describe('extractHandshakeCookie matches the real cookie-parser Express middleware (design.md Risk mitigation)', () => {
  const buildCookieParserApp = () => {
    const app = express();
    app.use(cookieParser());
    app.get('/echo', (req, res) => {
      res.json({ refreshToken: req.cookies?.refreshToken });
    });
    return app;
  };

  it('agrees with cookie-parser for a simple single cookie', async () => {
    const header = 'refreshToken=abc123';
    const res = await request(buildCookieParserApp()).get('/echo').set('Cookie', header);
    expect(extractHandshakeCookie(header)).toBe(res.body.refreshToken);
  });

  it('agrees with cookie-parser when other cookies are present alongside refreshToken', async () => {
    const header = 'theme=dark; refreshToken=xyz.987; lang=pt-BR';
    const res = await request(buildCookieParserApp()).get('/echo').set('Cookie', header);
    expect(extractHandshakeCookie(header)).toBe(res.body.refreshToken);
  });

  it('agrees with cookie-parser for a JWT-shaped value (dots, no special chars needing decode)', async () => {
    const jwtLike = 'header.payload.signature';
    const header = `refreshToken=${jwtLike}`;
    const res = await request(buildCookieParserApp()).get('/echo').set('Cookie', header);
    expect(extractHandshakeCookie(header)).toBe(jwtLike);
    expect(extractHandshakeCookie(header)).toBe(res.body.refreshToken);
  });
});
