import crypto from 'node:crypto';
import { Card, Customer, connect, disconnect, FieldTemplate, Order, Process, User } from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import * as cardRepository from './card.repository.js';

// Sem `mongoose` aqui (AD-010/boundary estrutural: só packages/db importa
// mongoose) — mesmo padrão de professional.repository.int.test.ts.
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
  return { process: processDoc, template };
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

const createUser = async (tenantId: string, name = 'Operador Ana') =>
  User.create({
    name,
    email: `${randomId()}@example.com`,
    password: 'hashed',
    Tenant: tenantId,
    role: ['operador'],
  });

describe('card.repository', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
  });

  afterEach(async () => {
    await Promise.all([
      Card.deleteMany({}),
      Customer.deleteMany({}),
      Process.deleteMany({}),
      FieldTemplate.deleteMany({}),
      Order.deleteMany({}),
      User.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await disconnect();
  });

  describe('createCard', () => {
    it('persists a card with only the required fields, no optional reference set (KAN-13)', async () => {
      const tenantId = randomId();
      const boardId = randomId();
      const columnId = randomId();

      const result = await cardRepository.createCard({
        tenant: tenantId,
        board: boardId,
        column: columnId,
        title: 'Ligar para o cliente',
        position: 0,
      });

      expect(result.title).toBe('Ligar para o cliente');
      expect(result.board).toBe(boardId);
      expect(result.column).toBe(columnId);
      expect(result.customer).toBeUndefined();
    });

    it('persists a card with the 4 optional references set (KAN-14)', async () => {
      const tenantId = randomId();
      const boardId = randomId();
      const columnId = randomId();
      const customer = await createCustomer(tenantId);
      const { process: proc } = await createProcessWithTemplate(tenantId, customer.id);
      const order = await createOrder(tenantId, customer.id);
      const user = await createUser(tenantId);

      const result = await cardRepository.createCard({
        tenant: tenantId,
        board: boardId,
        column: columnId,
        title: 'Card completo',
        position: 0,
        customer: customer.id,
        process: proc.id,
        order: order.id,
        assignee: user.id,
      });

      expect(result.customer).toBe(customer.id);
      expect(result.process).toBe(proc.id);
      expect(result.order).toBe(order.id);
      expect(result.assignee).toBe(user.id);
    });
  });

  describe('findById', () => {
    it('returns null for a card that belongs to a DIFFERENT board (AD-010, board scoping)', async () => {
      const tenantId = randomId();
      const boardId = randomId();
      const otherBoardId = randomId();
      const created = await cardRepository.createCard({
        tenant: tenantId,
        board: boardId,
        column: randomId(),
        title: 'Card',
        position: 0,
      });

      const result = await cardRepository.findById(tenantId, otherBoardId, created.id);

      expect(result).toBeNull();
    });

    it('returns null for a card that belongs to a DIFFERENT tenant (AD-010)', async () => {
      const owner = randomId();
      const intruder = randomId();
      const boardId = randomId();
      const created = await cardRepository.createCard({
        tenant: owner,
        board: boardId,
        column: randomId(),
        title: 'Card',
        position: 0,
      });

      const result = await cardRepository.findById(intruder, boardId, created.id);

      expect(result).toBeNull();
    });
  });

  describe('listByBoard', () => {
    it('resolves customer.name, process.stage+template.name, order.totalPrice+status, assignee.name (KAN-24..27)', async () => {
      const tenantId = randomId();
      const boardId = randomId();
      const customer = await createCustomer(tenantId, 'Maria Cliente');
      const { process: proc } = await createProcessWithTemplate(tenantId, customer.id, 'Negociação');
      const order = await createOrder(tenantId, customer.id);
      const user = await createUser(tenantId, 'Operador Bruno');
      await cardRepository.createCard({
        tenant: tenantId,
        board: boardId,
        column: randomId(),
        title: 'Card completo',
        position: 0,
        customer: customer.id,
        process: proc.id,
        order: order.id,
        assignee: user.id,
      });

      const [record] = await cardRepository.listByBoard(tenantId, boardId);

      expect(record?.customerName).toBe('Maria Cliente');
      expect(record?.processStage).toBe('Negociação');
      expect(record?.processTemplateName).toBe('Fluxo Padrão');
      expect(record?.orderTotalPrice).toBe(100);
      expect(record?.orderStatus).toBe('pending_approval');
      expect(record?.assigneeName).toBe('Operador Bruno');
    });

    it('omits every display field for a card with no optional reference (KAN-28)', async () => {
      const tenantId = randomId();
      const boardId = randomId();
      await cardRepository.createCard({
        tenant: tenantId,
        board: boardId,
        column: randomId(),
        title: 'Só título',
        position: 0,
      });

      const [record] = await cardRepository.listByBoard(tenantId, boardId);

      expect(record?.customerName).toBeUndefined();
      expect(record?.processStage).toBeUndefined();
      expect(record?.orderTotalPrice).toBeUndefined();
      expect(record?.assigneeName).toBeUndefined();
    });

    it('never exposes Process.values, User.password or User.email (only the display fields listed in design.md)', async () => {
      const tenantId = randomId();
      const boardId = randomId();
      const customer = await createCustomer(tenantId);
      const { process: proc } = await createProcessWithTemplate(tenantId, customer.id);
      const user = await createUser(tenantId);
      await cardRepository.createCard({
        tenant: tenantId,
        board: boardId,
        column: randomId(),
        title: 'Card',
        position: 0,
        process: proc.id,
        assignee: user.id,
      });

      const [record] = await cardRepository.listByBoard(tenantId, boardId);

      const keys = Object.keys(record ?? {});
      expect(keys).not.toContain('values');
      expect(keys).not.toContain('password');
      expect(keys).not.toContain('email');
    });

    it('never returns a card from a DIFFERENT board (AD-010 board scoping)', async () => {
      const tenantId = randomId();
      const boardId = randomId();
      const otherBoardId = randomId();
      await cardRepository.createCard({
        tenant: tenantId,
        board: boardId,
        column: randomId(),
        title: 'Meu',
        position: 0,
      });
      await cardRepository.createCard({
        tenant: tenantId,
        board: otherBoardId,
        column: randomId(),
        title: 'De outro board',
        position: 0,
      });

      const result = await cardRepository.listByBoard(tenantId, boardId);

      expect(result).toHaveLength(1);
      expect(result[0]?.title).toBe('Meu');
    });
  });

  describe('updateCard', () => {
    it('updates only the fields provided, without touching column/position', async () => {
      const tenantId = randomId();
      const boardId = randomId();
      const columnId = randomId();
      const created = await cardRepository.createCard({
        tenant: tenantId,
        board: boardId,
        column: columnId,
        title: 'Original',
        position: 3,
      });

      const result = await cardRepository.updateCard(tenantId, boardId, created.id, { title: 'Editado' });

      expect(result?.title).toBe('Editado');
      expect(result?.column).toBe(columnId);
      expect(result?.position).toBe(3);
    });
  });

  describe('moveCard', () => {
    it('persists the new column and position (KAN-18, KAN-19)', async () => {
      const tenantId = randomId();
      const boardId = randomId();
      const targetColumnId = randomId();
      const created = await cardRepository.createCard({
        tenant: tenantId,
        board: boardId,
        column: randomId(),
        title: 'Card',
        position: 0,
      });

      const result = await cardRepository.moveCard(tenantId, boardId, created.id, targetColumnId, 2);

      expect(result?.column).toBe(targetColumnId);
      expect(result?.position).toBe(2);
    });
  });

  describe('deleteCard', () => {
    it('removes the card for its own tenant/board (KAN-13, deletedCount 1)', async () => {
      const tenantId = randomId();
      const boardId = randomId();
      const created = await cardRepository.createCard({
        tenant: tenantId,
        board: boardId,
        column: randomId(),
        title: 'A apagar',
        position: 0,
      });

      const result = await cardRepository.deleteCard(tenantId, boardId, created.id);

      expect(result.deletedCount).toBe(1);
      expect(await cardRepository.findById(tenantId, boardId, created.id)).toBeNull();
    });
  });

  describe('existsInColumn', () => {
    it('returns false for an empty column, true with 1 card, true with N cards (KAN-10)', async () => {
      const tenantId = randomId();
      const boardId = randomId();
      const columnId = randomId();

      expect(await cardRepository.existsInColumn(tenantId, boardId, columnId)).toBe(false);

      await cardRepository.createCard({ tenant: tenantId, board: boardId, column: columnId, title: 'C1', position: 0 });
      expect(await cardRepository.existsInColumn(tenantId, boardId, columnId)).toBe(true);

      await cardRepository.createCard({ tenant: tenantId, board: boardId, column: columnId, title: 'C2', position: 1 });
      expect(await cardRepository.existsInColumn(tenantId, boardId, columnId)).toBe(true);
    });
  });

  describe('deleteAllByBoard', () => {
    it('removes every card of the board and none of a different board (KAN-22 cascade)', async () => {
      const tenantId = randomId();
      const boardId = randomId();
      const otherBoardId = randomId();
      await cardRepository.createCard({
        tenant: tenantId,
        board: boardId,
        column: randomId(),
        title: 'C1',
        position: 0,
      });
      await cardRepository.createCard({
        tenant: tenantId,
        board: boardId,
        column: randomId(),
        title: 'C2',
        position: 1,
      });
      const survivor = await cardRepository.createCard({
        tenant: tenantId,
        board: otherBoardId,
        column: randomId(),
        title: 'Sobrevive',
        position: 0,
      });

      const result = await cardRepository.deleteAllByBoard(tenantId, boardId);

      expect(result.deletedCount).toBe(2);
      expect(await cardRepository.listByBoard(tenantId, boardId)).toHaveLength(0);
      expect(await cardRepository.findById(tenantId, otherBoardId, survivor.id)).not.toBeNull();
    });
  });
});
