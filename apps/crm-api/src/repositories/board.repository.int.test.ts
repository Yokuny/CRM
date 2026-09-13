import crypto from 'node:crypto';
import { Board, Card, connect, disconnect } from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as boardRepository from './board.repository.js';

// Sem `mongoose` aqui (AD-010/boundary estrutural: só packages/db importa
// mongoose) — mesmo padrão de professional.repository.int.test.ts.
const randomId = (): string => crypto.randomBytes(12).toString('hex');

const oneColumn = [{ label: 'A fazer' }];

describe('board.repository', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
  });

  afterEach(async () => {
    await Board.deleteMany({});
    await Card.deleteMany({});
  });

  afterAll(async () => {
    await disconnect();
  });

  describe('createBoard', () => {
    it('persists Tenant and assigns order 0..n-1 to the initial columns (KAN-01)', async () => {
      const tenantId = randomId();

      const result = await boardRepository.createBoard({
        tenant: tenantId,
        name: 'Cobranças em atraso',
        columns: [{ label: 'A fazer' }, { label: 'Em andamento', color: '#00AA00' }],
      });

      const persisted = await Board.findById(result.id).lean();
      expect(persisted?.Tenant.toString()).toBe(tenantId);
      expect(result.columns.map((c) => c.order)).toEqual([0, 1]);
      expect(result.columns[1]?.color).toBe('#00AA00');
    });
  });

  describe('findById', () => {
    it('returns null for a board that belongs to a DIFFERENT tenant (AD-010)', async () => {
      const owner = randomId();
      const intruder = randomId();
      const created = await boardRepository.createBoard({ tenant: owner, name: 'Board do owner', columns: oneColumn });

      const result = await boardRepository.findById(intruder, created.id);

      expect(result).toBeNull();
    });

    it('returns the board for its own tenant', async () => {
      const tenantId = randomId();
      const created = await boardRepository.createBoard({ tenant: tenantId, name: 'Meu board', columns: oneColumn });

      const result = await boardRepository.findById(tenantId, created.id);

      expect(result?.id).toBe(created.id);
      expect(result?.name).toBe('Meu board');
    });
  });

  describe('listBoards', () => {
    it('runs exactly 1 aggregation query regardless of the number of boards (design.md Risk, no N+1)', async () => {
      const tenantId = randomId();
      for (let i = 0; i < 3; i += 1) {
        await boardRepository.createBoard({ tenant: tenantId, name: `Board ${i}`, columns: oneColumn });
      }
      const aggregateSpy = vi.spyOn(Board, 'aggregate');

      await boardRepository.listBoards(tenantId);

      expect(aggregateSpy).toHaveBeenCalledTimes(1);
      aggregateSpy.mockRestore();
    });

    it('returns the card count per board without leaking another tenant/board card count', async () => {
      const tenantId = randomId();
      const otherTenant = randomId();
      const boardWithCards = await boardRepository.createBoard({
        tenant: tenantId,
        name: 'Com cards',
        columns: oneColumn,
      });
      const boardWithoutCards = await boardRepository.createBoard({
        tenant: tenantId,
        name: 'Sem cards',
        columns: oneColumn,
      });
      await boardRepository.createBoard({ tenant: otherTenant, name: 'De outro tenant', columns: oneColumn });
      const columnId = boardWithCards.columns[0]?.id;
      await Card.create({ Tenant: tenantId, board: boardWithCards.id, column: columnId, title: 'C1', position: 0 });
      await Card.create({ Tenant: tenantId, board: boardWithCards.id, column: columnId, title: 'C2', position: 1 });

      const result = await boardRepository.listBoards(tenantId);

      expect(result).toHaveLength(2);
      expect(result.find((b) => b.id === boardWithCards.id)?.cardCount).toBe(2);
      expect(result.find((b) => b.id === boardWithoutCards.id)?.cardCount).toBe(0);
    });

    it('orders boards by updatedAt descending (KAN-03) and never returns another tenant board', async () => {
      const tenantId = randomId();
      const otherTenant = randomId();
      const older = await boardRepository.createBoard({ tenant: tenantId, name: 'Mais antigo', columns: oneColumn });
      const newer = await boardRepository.createBoard({ tenant: tenantId, name: 'Mais recente', columns: oneColumn });
      await boardRepository.createBoard({ tenant: otherTenant, name: 'De outro tenant', columns: oneColumn });
      await boardRepository.updateBoard(tenantId, older.id, { description: 'agora é o mais recente' });

      const result = await boardRepository.listBoards(tenantId);

      expect(result.every((b) => b.name !== 'De outro tenant')).toBe(true);
      expect(result[0]?.id).toBe(older.id);
      expect(result[1]?.id).toBe(newer.id);
    });
  });

  describe('updateBoard', () => {
    it('updates only the fields provided, leaving columns untouched', async () => {
      const tenantId = randomId();
      const created = await boardRepository.createBoard({ tenant: tenantId, name: 'Original', columns: oneColumn });

      const result = await boardRepository.updateBoard(tenantId, created.id, { description: 'Nova descrição' });

      expect(result?.name).toBe('Original');
      expect(result?.description).toBe('Nova descrição');
      expect(result?.columns).toHaveLength(1);
    });

    it("returns null and leaves the board untouched for a DIFFERENT tenant's id (AD-010)", async () => {
      const owner = randomId();
      const intruder = randomId();
      const created = await boardRepository.createBoard({ tenant: owner, name: 'Original', columns: oneColumn });

      const result = await boardRepository.updateBoard(intruder, created.id, { name: 'Sequestrado' });

      expect(result).toBeNull();
      const persisted = await Board.findById(created.id).lean();
      expect(persisted?.name).toBe('Original');
    });
  });

  describe('deleteBoard', () => {
    it('removes the board for its own tenant (deletedCount 1)', async () => {
      const tenantId = randomId();
      const created = await boardRepository.createBoard({ tenant: tenantId, name: 'A apagar', columns: oneColumn });

      const result = await boardRepository.deleteBoard(tenantId, created.id);

      expect(result.deletedCount).toBe(1);
      expect(await Board.findById(created.id).lean()).toBeNull();
    });

    it("returns deletedCount 0 and leaves the board intact for a DIFFERENT tenant's id (AD-010)", async () => {
      const owner = randomId();
      const intruder = randomId();
      const created = await boardRepository.createBoard({ tenant: owner, name: 'Intacto', columns: oneColumn });

      const result = await boardRepository.deleteBoard(intruder, created.id);

      expect(result.deletedCount).toBe(0);
      expect(await Board.findById(created.id).lean()).not.toBeNull();
    });
  });

  describe('addColumn', () => {
    it('appends the new column at the end of the current order (KAN-07)', async () => {
      const tenantId = randomId();
      const created = await boardRepository.createBoard({ tenant: tenantId, name: 'Board', columns: oneColumn });

      const result = await boardRepository.addColumn(tenantId, created.id, { label: 'Concluído', color: '#123456' });

      expect(result?.columns).toHaveLength(2);
      expect(result?.columns[1]?.label).toBe('Concluído');
      expect(result?.columns[1]?.order).toBe(1);
    });
  });

  describe('updateColumn', () => {
    it('renames one column without moving or touching the others (KAN-08)', async () => {
      const tenantId = randomId();
      const created = await boardRepository.createBoard({
        tenant: tenantId,
        name: 'Board',
        columns: [{ label: 'A fazer' }, { label: 'Em andamento' }],
      });
      const targetColumnId = created.columns[1]?.id as string;

      const result = await boardRepository.updateColumn(tenantId, created.id, targetColumnId, {
        label: 'Fazendo',
        color: '#ABCDEF',
      });

      expect(result?.columns.find((c) => c.id === targetColumnId)?.label).toBe('Fazendo');
      expect(result?.columns.find((c) => c.id === targetColumnId)?.color).toBe('#ABCDEF');
      expect(result?.columns.find((c) => c.id === created.columns[0]?.id)?.label).toBe('A fazer');
    });
  });

  describe('reorderColumns', () => {
    it('recalculates order from the position of each id in the given array (KAN-09)', async () => {
      const tenantId = randomId();
      const created = await boardRepository.createBoard({
        tenant: tenantId,
        name: 'Board',
        columns: [{ label: 'A' }, { label: 'B' }, { label: 'C' }],
      });
      const [a, b, c] = created.columns;

      const result = await boardRepository.reorderColumns(tenantId, created.id, [
        c?.id as string,
        a?.id as string,
        b?.id as string,
      ]);

      expect(result?.columns.find((col) => col.id === c?.id)?.order).toBe(0);
      expect(result?.columns.find((col) => col.id === a?.id)?.order).toBe(1);
      expect(result?.columns.find((col) => col.id === b?.id)?.order).toBe(2);
      expect(result?.columns).toHaveLength(3);
    });
  });

  describe('removeColumn', () => {
    it('removes the targeted empty column, keeping the rest of the board intact (KAN-12)', async () => {
      const tenantId = randomId();
      const created = await boardRepository.createBoard({
        tenant: tenantId,
        name: 'Board',
        columns: [{ label: 'A fazer' }, { label: 'Em andamento' }],
      });
      const targetColumnId = created.columns[1]?.id as string;

      const result = await boardRepository.removeColumn(tenantId, created.id, targetColumnId);

      expect(result?.columns).toHaveLength(1);
      expect(result?.columns[0]?.id).toBe(created.columns[0]?.id);
    });
  });
});
