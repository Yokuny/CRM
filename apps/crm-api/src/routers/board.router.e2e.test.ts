import crypto from 'node:crypto';
import type { Role } from '@crm/contracts';
import {
  Board,
  Card,
  Customer,
  connect,
  disconnect,
  FieldTemplate,
  hashToken,
  Order,
  Process,
  Session,
  syncIndexes,
  Tenant,
  User,
} from '@crm/db';
import cookieParser from 'cookie-parser';
import express from 'express';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../config/env.config.js';
import type { AuthDeps } from '../middlewares/authentication.middleware.js';
import { createAuthMiddleware } from '../middlewares/authentication.middleware.js';
import { errorHandler } from '../middlewares/errorHandler.middleware.js';
import { createBoardRouter } from './board.router.js';

const DEVICE = 'test-agent';

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

const buildTestApp = () => {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  const { validToken } = createAuthMiddleware(buildAuthDeps());
  app.use('/boards', createBoardRouter({ validToken }));
  app.use(errorHandler);
  return app;
};

// Fixtures de referência do card (KAN-14/24-27) — mesmo formato de
// card.repository.int.test.ts: `template`/`conversation`/`product` recebem
// um ObjectId aleatório (nunca precisam resolver pra um documento real, só
// o formato importa pro Mongoose).
const randomId = (): string => crypto.randomBytes(12).toString('hex');

const createCustomer = async (tenantId: string, name = 'Cliente X') =>
  Customer.create({ Tenant: tenantId, name, phone: '5511999999999', template: randomId(), templateVersion: 1 });

const createProcessWithTemplate = async (tenantId: string, customerId: string, stage = 'Em andamento') => {
  const template = await FieldTemplate.create({
    Tenant: tenantId,
    targetType: 'process',
    key: `flow-${randomId()}`,
    name: 'Fluxo Padrão',
    currentVersion: 1,
  });
  const processDoc = await Process.create({
    Tenant: tenantId,
    customer: customerId,
    template: template._id,
    templateVersion: 1,
    stage,
  });
  return processDoc;
};

const createOrder = async (tenantId: string, customerId: string) =>
  Order.create({
    Tenant: tenantId,
    conversation: randomId(),
    customer: customerId,
    items: [{ product: randomId(), name: 'Produto', unitPrice: 100, quantity: 1 }],
    totalPrice: 100,
    status: 'pending_approval',
    idempotencyKey: `key-${randomId()}`,
  });

// Cada teste recebe seu PRÓPRIO Tenant — mesmo padrão de
// professional.router.e2e.test.ts (isolamento entre casos deste arquivo).
let seq = 0;
const seedTenantUser = async (role: Role[]) => {
  seq += 1;
  const tenant = await Tenant.create({
    name: `Empresa ${seq}`,
    document: String(10000000000000 + seq),
    status: 'active',
  });
  const user = await User.create({
    name: 'Fulano de Tal',
    email: `user-${seq}@empresa.com`,
    password: 'hash',
    Tenant: tenant._id,
    role,
  });
  const cookie = await issueSessionCookie(user.id);
  return { tenant, user, cookie };
};

describe('board routes', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
    await syncIndexes();
  });

  afterEach(async () => {
    await Promise.all([
      Card.deleteMany({}),
      Board.deleteMany({}),
      Customer.deleteMany({}),
      Process.deleteMany({}),
      FieldTemplate.deleteMany({}),
      Order.deleteMany({}),
      Session.deleteMany({}),
      User.deleteMany({}),
      Tenant.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await disconnect();
  });

  describe('POST /boards (spec.md P1 "Board CRUD e hub"/KAN-01)', () => {
    it('creates a Board scoped to the session Tenant, with the given columns and no cards', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const app = buildTestApp();

      const res = await request(app)
        .post('/boards')
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ name: 'Cobranças em atraso', columns: [{ label: 'A fazer' }, { label: 'Feito' }] });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Cobranças em atraso');
      expect(res.body.data.columns.map((c: { label: string }) => c.label)).toEqual(['A fazer', 'Feito']);
      const persisted = await Board.findById(res.body.data.id).lean();
      expect(persisted?.Tenant.toString()).toBe(tenant._id.toString());
      expect(await Card.countDocuments({ board: res.body.data.id })).toBe(0);
    });

    it('rejects a board created with zero columns, creating nothing (spec.md KAN-02)', async () => {
      const { cookie } = await seedTenantUser(['operador']);
      const app = buildTestApp();

      const res = await request(app)
        .post('/boards')
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ name: 'Board vazio', columns: [] });

      expect(res.status).toBe(400);
      expect(await Board.countDocuments({})).toBe(0);
    });

    it('persists column color when informed (spec.md KAN-29)', async () => {
      const { cookie } = await seedTenantUser(['operador']);
      const app = buildTestApp();

      const res = await request(app)
        .post('/boards')
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ name: 'Board colorido', columns: [{ label: 'A fazer', color: '#FF0000' }] });

      expect(res.status).toBe(201);
      expect(res.body.data.columns[0].color).toBe('#FF0000');
    });

    it('responds 403 for a caller without any operational role, creating nothing (spec.md KAN-05)', async () => {
      const { cookie } = await seedTenantUser([]);
      const app = buildTestApp();

      const res = await request(app)
        .post('/boards')
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ name: 'Board qualquer', columns: [{ label: 'A fazer' }] });

      expect(res.status).toBe(403);
      expect(await Board.countDocuments({})).toBe(0);
    });
  });

  describe('GET /boards (spec.md KAN-03)', () => {
    it('lists only the boards from the session tenant, ordered by most recently updated', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const older = await Board.create({
        Tenant: tenant._id,
        name: 'Mais antigo',
        columns: [{ label: 'A', order: 0 }],
      });
      await new Promise((resolve) => setTimeout(resolve, 5));
      const newer = await Board.create({
        Tenant: tenant._id,
        name: 'Mais recente',
        columns: [{ label: 'A', order: 0 }],
      });
      const other = await seedTenantUser(['admin']);
      await Board.create({ Tenant: other.tenant._id, name: 'De outro tenant', columns: [{ label: 'A', order: 0 }] });
      const app = buildTestApp();

      const res = await request(app).get('/boards').set('Cookie', cookie).set('User-Agent', DEVICE);

      expect(res.status).toBe(200);
      expect(res.body.data.map((b: { id: string }) => b.id)).toEqual([newer._id.toString(), older._id.toString()]);
    });

    it('responds 403 for a caller without any operational role (spec.md KAN-05)', async () => {
      const { cookie } = await seedTenantUser([]);
      const app = buildTestApp();

      const res = await request(app).get('/boards').set('Cookie', cookie).set('User-Agent', DEVICE);

      expect(res.status).toBe(403);
    });
  });

  describe('GET /boards/:id (spec.md KAN-06)', () => {
    it('responds 200 with the Board for its own tenant', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const board = await Board.create({ Tenant: tenant._id, name: 'Meu board', columns: [{ label: 'A', order: 0 }] });
      const app = buildTestApp();

      const res = await request(app)
        .get(`/boards/${board._id.toString()}`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Meu board');
    });

    it("responds 404 for an id belonging to another tenant's Board (spec.md KAN-06)", async () => {
      const { cookie } = await seedTenantUser(['operador']);
      const owner = await seedTenantUser(['admin']);
      const board = await Board.create({
        Tenant: owner.tenant._id,
        name: 'De outro tenant',
        columns: [{ label: 'A', order: 0 }],
      });
      const app = buildTestApp();

      const res = await request(app)
        .get(`/boards/${board._id.toString()}`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /boards/:id (spec.md KAN-04)', () => {
    it('updates only the fields informed, leaving columns untouched', async () => {
      const { tenant, cookie } = await seedTenantUser(['gestor']);
      const board = await Board.create({
        Tenant: tenant._id,
        name: 'Nome antigo',
        columns: [{ label: 'A', order: 0 }],
      });
      const app = buildTestApp();

      const res = await request(app)
        .patch(`/boards/${board._id.toString()}`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ description: 'Nova descrição' });

      expect(res.status).toBe(200);
      expect(res.body.data.description).toBe('Nova descrição');
      expect(res.body.data.name).toBe('Nome antigo');
      expect(res.body.data.columns).toHaveLength(1);
    });

    it("responds 404 for an id belonging to another tenant's Board (spec.md KAN-06)", async () => {
      const { cookie } = await seedTenantUser(['gestor']);
      const owner = await seedTenantUser(['admin']);
      const board = await Board.create({
        Tenant: owner.tenant._id,
        name: 'De outro tenant',
        columns: [{ label: 'A', order: 0 }],
      });
      const app = buildTestApp();

      const res = await request(app)
        .patch(`/boards/${board._id.toString()}`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ name: 'Tentativa' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /boards/:id (spec.md P2 "Apagar board"/KAN-22/KAN-23)', () => {
    it('removes the board and all its cards when called by an admin', async () => {
      const { tenant, cookie } = await seedTenantUser(['admin']);
      const board = await Board.create({ Tenant: tenant._id, name: 'Obsoleto', columns: [{ label: 'A', order: 0 }] });
      await Card.create({
        Tenant: tenant._id,
        board: board._id,
        column: board.columns[0]?._id,
        title: 'Tarefa',
        position: 0,
      });
      const app = buildTestApp();

      const res = await request(app)
        .delete(`/boards/${board._id.toString()}`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(200);
      expect(await Board.findById(board._id).lean()).toBeNull();
      expect(await Card.countDocuments({ board: board._id })).toBe(0);
    });

    it('responds 403 for a caller with gestor/operador (without admin), leaving the board untouched (spec.md KAN-23)', async () => {
      const { tenant, cookie } = await seedTenantUser(['gestor']);
      const board = await Board.create({
        Tenant: tenant._id,
        name: 'Ainda em uso',
        columns: [{ label: 'A', order: 0 }],
      });
      const app = buildTestApp();

      const res = await request(app)
        .delete(`/boards/${board._id.toString()}`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(403);
      expect(await Board.findById(board._id).lean()).not.toBeNull();
    });
  });

  describe('POST /boards/:id/columns (spec.md KAN-07)', () => {
    it('appends the new column to the end of the current order', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const board = await Board.create({
        Tenant: tenant._id,
        name: 'Board',
        columns: [
          { label: 'A', order: 0 },
          { label: 'B', order: 1 },
        ],
      });
      const app = buildTestApp();

      const res = await request(app)
        .post(`/boards/${board._id.toString()}/columns`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ label: 'C' });

      expect(res.status).toBe(201);
      expect(res.body.data.columns.map((c: { label: string }) => c.label)).toEqual(['A', 'B', 'C']);
    });
  });

  describe('PATCH /boards/:id/columns/:columnId (spec.md KAN-08)', () => {
    it('renames the column without moving the cards already associated to it', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const board = await Board.create({ Tenant: tenant._id, name: 'Board', columns: [{ label: 'A', order: 0 }] });
      const columnId = board.columns[0]?._id.toString() as string;
      const card = await Card.create({
        Tenant: tenant._id,
        board: board._id,
        column: columnId,
        title: 'Tarefa',
        position: 0,
      });
      const app = buildTestApp();

      const res = await request(app)
        .patch(`/boards/${board._id.toString()}/columns/${columnId}`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ label: 'Renomeada' });

      expect(res.status).toBe(200);
      expect(res.body.data.columns[0].label).toBe('Renomeada');
      const persistedCard = await Card.findById(card._id).lean();
      expect(persistedCard?.column.toString()).toBe(columnId);
    });
  });

  describe('PATCH /boards/:id/columns/reorder (spec.md KAN-09)', () => {
    it('persists the new column order — declared before :columnId so "reorder" is never matched as an id', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const board = await Board.create({
        Tenant: tenant._id,
        name: 'Board',
        columns: [
          { label: 'A', order: 0 },
          { label: 'B', order: 1 },
        ],
      });
      const [colA, colB] = board.columns;
      const app = buildTestApp();

      const res = await request(app)
        .patch(`/boards/${board._id.toString()}/columns/reorder`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ columnIds: [colB?._id.toString(), colA?._id.toString()] });

      expect(res.status).toBe(200);
      const labelsInOrder = [...res.body.data.columns].sort(
        (a: { order: number }, b: { order: number }) => a.order - b.order,
      );
      expect(labelsInOrder.map((c: { label: string }) => c.label)).toEqual(['B', 'A']);
    });
  });

  describe('DELETE /boards/:id/columns/:columnId (spec.md KAN-10/KAN-11/KAN-12)', () => {
    it('removes an empty column when the board has more than 1 column (spec.md KAN-12)', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const board = await Board.create({
        Tenant: tenant._id,
        name: 'Board',
        columns: [
          { label: 'A', order: 0 },
          { label: 'B', order: 1 },
        ],
      });
      const columnId = board.columns[1]?._id.toString() as string;
      const app = buildTestApp();

      const res = await request(app)
        .delete(`/boards/${board._id.toString()}/columns/${columnId}`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(200);
      expect(res.body.data.columns).toHaveLength(1);
    });

    it('rejects removing a column that still has at least 1 card (spec.md KAN-10)', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const board = await Board.create({
        Tenant: tenant._id,
        name: 'Board',
        columns: [
          { label: 'A', order: 0 },
          { label: 'B', order: 1 },
        ],
      });
      const columnId = board.columns[0]?._id.toString() as string;
      await Card.create({ Tenant: tenant._id, board: board._id, column: columnId, title: 'Tarefa', position: 0 });
      const app = buildTestApp();

      const res = await request(app)
        .delete(`/boards/${board._id.toString()}/columns/${columnId}`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(400);
      const persisted = await Board.findById(board._id).lean();
      expect(persisted?.columns).toHaveLength(2);
    });

    it('rejects removing the last remaining column of a board, even if empty (spec.md KAN-11)', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const board = await Board.create({ Tenant: tenant._id, name: 'Board', columns: [{ label: 'Única', order: 0 }] });
      const columnId = board.columns[0]?._id.toString() as string;
      const app = buildTestApp();

      const res = await request(app)
        .delete(`/boards/${board._id.toString()}/columns/${columnId}`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(400);
      const persisted = await Board.findById(board._id).lean();
      expect(persisted?.columns).toHaveLength(1);
    });
  });

  describe('POST /boards/:id/cards (spec.md P1 "CRUD de card"/KAN-13/KAN-14/KAN-15)', () => {
    it('creates a card with only title and destination column, no optional reference (spec.md KAN-13)', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const board = await Board.create({ Tenant: tenant._id, name: 'Board', columns: [{ label: 'A', order: 0 }] });
      const columnId = board.columns[0]?._id.toString() as string;
      const app = buildTestApp();

      const res = await request(app)
        .post(`/boards/${board._id.toString()}/cards`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ title: 'Ligar para o cliente', column: columnId });

      expect(res.status).toBe(201);
      expect(res.body.data.title).toBe('Ligar para o cliente');
      expect(res.body.data.customer).toBeUndefined();
      expect(await Card.countDocuments({ board: board._id })).toBe(1);
    });

    it("rejects an assignee id belonging to ANOTHER tenant's User, creating nothing (spec.md KAN-14)", async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const board = await Board.create({ Tenant: tenant._id, name: 'Board', columns: [{ label: 'A', order: 0 }] });
      const columnId = board.columns[0]?._id.toString() as string;
      const other = await seedTenantUser(['admin']);
      const app = buildTestApp();

      const res = await request(app)
        .post(`/boards/${board._id.toString()}/cards`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ title: 'Card', column: columnId, assignee: other.user.id });

      expect(res.status).toBe(400);
      expect(await Card.countDocuments({})).toBe(0);
    });

    it('rejects a customer id that does not exist at all, creating nothing (spec.md KAN-14)', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const board = await Board.create({ Tenant: tenant._id, name: 'Board', columns: [{ label: 'A', order: 0 }] });
      const columnId = board.columns[0]?._id.toString() as string;
      const app = buildTestApp();

      const res = await request(app)
        .post(`/boards/${board._id.toString()}/cards`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ title: 'Card', column: columnId, customer: randomId() });

      expect(res.status).toBe(400);
      expect(await Card.countDocuments({})).toBe(0);
    });

    it('rejects a column that does not exist in that board, even with a well-formed id (spec.md KAN-15)', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const board = await Board.create({ Tenant: tenant._id, name: 'Board', columns: [{ label: 'A', order: 0 }] });
      const app = buildTestApp();

      const res = await request(app)
        .post(`/boards/${board._id.toString()}/cards`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ title: 'Card', column: randomId() });

      expect(res.status).toBe(400);
      expect(await Card.countDocuments({})).toBe(0);
    });

    it('responds 403 for a caller without any operational role, creating nothing (spec.md KAN-05)', async () => {
      const { tenant, cookie } = await seedTenantUser([]);
      const board = await Board.create({ Tenant: tenant._id, name: 'Board', columns: [{ label: 'A', order: 0 }] });
      const columnId = board.columns[0]?._id.toString() as string;
      const app = buildTestApp();

      const res = await request(app)
        .post(`/boards/${board._id.toString()}/cards`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ title: 'Card', column: columnId });

      expect(res.status).toBe(403);
      expect(await Card.countDocuments({})).toBe(0);
    });
  });

  describe('GET /boards/:id/cards (spec.md P2 "Card exibe vínculos"/KAN-24..28)', () => {
    it('returns customer.name, process.stage+template.name, order.totalPrice+status and assignee.name when present (spec.md KAN-24..27)', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const board = await Board.create({ Tenant: tenant._id, name: 'Board', columns: [{ label: 'A', order: 0 }] });
      const columnId = board.columns[0]?._id.toString() as string;
      const customer = await createCustomer(tenant._id.toString(), 'Maria Cliente');
      const proc = await createProcessWithTemplate(tenant._id.toString(), customer.id, 'Negociação');
      const order = await createOrder(tenant._id.toString(), customer.id);
      // Responsável precisa ser um User do MESMO tenant do board (KAN-14) —
      // nunca via seedTenantUser (cria um Tenant novo a cada chamada).
      const assignee = await User.create({
        name: 'Operador Bruno',
        email: `${randomId()}@empresa.com`,
        password: 'hash',
        Tenant: tenant._id,
        role: ['operador'],
      });
      const app = buildTestApp();

      const createRes = await request(app)
        .post(`/boards/${board._id.toString()}/cards`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({
          title: 'Card completo',
          column: columnId,
          customer: customer.id,
          process: proc.id,
          order: order.id,
          assignee: assignee.id,
        });
      expect(createRes.status).toBe(201);

      const res = await request(app)
        .get(`/boards/${board._id.toString()}/cards`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(200);
      const [card] = res.body.data;
      expect(card.customerName).toBe('Maria Cliente');
      expect(card.processStage).toBe('Negociação');
      expect(card.processTemplateName).toBe('Fluxo Padrão');
      expect(card.orderTotalPrice).toBe(100);
      expect(card.orderStatus).toBe('pending_approval');
      expect(card.assigneeName).toBe('Operador Bruno');
    });

    it('omits every display field for a card with no optional reference (spec.md KAN-28)', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const board = await Board.create({ Tenant: tenant._id, name: 'Board', columns: [{ label: 'A', order: 0 }] });
      const columnId = board.columns[0]?._id.toString() as string;
      await Card.create({ Tenant: tenant._id, board: board._id, column: columnId, title: 'Só título', position: 0 });
      const app = buildTestApp();

      const res = await request(app)
        .get(`/boards/${board._id.toString()}/cards`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(200);
      const [card] = res.body.data;
      expect(card.customerName).toBeUndefined();
      expect(card.processStage).toBeUndefined();
      expect(card.orderTotalPrice).toBeUndefined();
      expect(card.assigneeName).toBeUndefined();
    });
  });

  describe('PATCH /boards/:id/cards/:cardId (spec.md KAN-16)', () => {
    it('updates title/description/references without altering the current column', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const board = await Board.create({
        Tenant: tenant._id,
        name: 'Board',
        columns: [
          { label: 'A', order: 0 },
          { label: 'B', order: 1 },
        ],
      });
      const columnId = board.columns[0]?._id.toString() as string;
      const card = await Card.create({
        Tenant: tenant._id,
        board: board._id,
        column: columnId,
        title: 'Original',
        position: 0,
      });
      const app = buildTestApp();

      const res = await request(app)
        .patch(`/boards/${board._id.toString()}/cards/${card._id.toString()}`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ title: 'Editado' });

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Editado');
      expect(res.body.data.column).toBe(columnId);
    });

    it("responds 404 for a card belonging to ANOTHER board's tenant (AD-010)", async () => {
      const { cookie } = await seedTenantUser(['operador']);
      const owner = await seedTenantUser(['admin']);
      const board = await Board.create({
        Tenant: owner.tenant._id,
        name: 'Board',
        columns: [{ label: 'A', order: 0 }],
      });
      const columnId = board.columns[0]?._id.toString() as string;
      const card = await Card.create({
        Tenant: owner.tenant._id,
        board: board._id,
        column: columnId,
        title: 'De outro tenant',
        position: 0,
      });
      const app = buildTestApp();

      const res = await request(app)
        .patch(`/boards/${board._id.toString()}/cards/${card._id.toString()}`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ title: 'Tentativa' });

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /boards/:id/cards/:cardId/move (spec.md P1 "Mover card"/KAN-18/KAN-19/KAN-21)', () => {
    it('moves a card to a different column, persisting it (spec.md KAN-18)', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const board = await Board.create({
        Tenant: tenant._id,
        name: 'Board',
        columns: [
          { label: 'A', order: 0 },
          { label: 'B', order: 1 },
        ],
      });
      const [colA, colB] = board.columns;
      const card = await Card.create({
        Tenant: tenant._id,
        board: board._id,
        column: colA?._id,
        title: 'Card',
        position: 0,
      });
      const app = buildTestApp();

      const res = await request(app)
        .patch(`/boards/${board._id.toString()}/cards/${card._id.toString()}/move`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ column: colB?._id.toString(), position: 0 });

      expect(res.status).toBe(200);
      expect(res.body.data.column).toBe(colB?._id.toString());
    });

    it('reorders a card within the SAME column, persisting the new position (spec.md KAN-19)', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const board = await Board.create({ Tenant: tenant._id, name: 'Board', columns: [{ label: 'A', order: 0 }] });
      const columnId = board.columns[0]?._id.toString() as string;
      const card = await Card.create({
        Tenant: tenant._id,
        board: board._id,
        column: columnId,
        title: 'Card',
        position: 0,
      });
      const app = buildTestApp();

      const res = await request(app)
        .patch(`/boards/${board._id.toString()}/cards/${card._id.toString()}/move`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ column: columnId, position: 2 });

      expect(res.status).toBe(200);
      expect(res.body.data.position).toBe(2);
    });

    it('rejects a move payload referencing a column that does not exist in that board, backend-side (spec.md KAN-21)', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const board = await Board.create({ Tenant: tenant._id, name: 'Board', columns: [{ label: 'A', order: 0 }] });
      const columnId = board.columns[0]?._id.toString() as string;
      const card = await Card.create({
        Tenant: tenant._id,
        board: board._id,
        column: columnId,
        title: 'Card',
        position: 0,
      });
      const app = buildTestApp();

      const res = await request(app)
        .patch(`/boards/${board._id.toString()}/cards/${card._id.toString()}/move`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE)
        .send({ column: randomId(), position: 0 });

      expect(res.status).toBe(400);
      const persisted = await Card.findById(card._id).lean();
      expect(persisted?.column.toString()).toBe(columnId);
    });
  });

  describe('DELETE /boards/:id/cards/:cardId (spec.md KAN-17)', () => {
    it('removes the card from the board', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const board = await Board.create({ Tenant: tenant._id, name: 'Board', columns: [{ label: 'A', order: 0 }] });
      const columnId = board.columns[0]?._id.toString() as string;
      const card = await Card.create({
        Tenant: tenant._id,
        board: board._id,
        column: columnId,
        title: 'A apagar',
        position: 0,
      });
      const app = buildTestApp();

      const res = await request(app)
        .delete(`/boards/${board._id.toString()}/cards/${card._id.toString()}`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(200);
      expect(await Card.findById(card._id).lean()).toBeNull();
    });

    it('responds 404 for a card that no longer exists', async () => {
      const { tenant, cookie } = await seedTenantUser(['operador']);
      const board = await Board.create({ Tenant: tenant._id, name: 'Board', columns: [{ label: 'A', order: 0 }] });
      const app = buildTestApp();

      const res = await request(app)
        .delete(`/boards/${board._id.toString()}/cards/${randomId()}`)
        .set('Cookie', cookie)
        .set('User-Agent', DEVICE);

      expect(res.status).toBe(404);
    });
  });
});
