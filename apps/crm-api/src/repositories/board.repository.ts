import type { BoardColumn, BoardDocument } from '@crm/db';
import { Board, tenantScoped } from '@crm/db';
import { withDbTiming } from '../metrics/db.metric.js';

export type BoardColumnRecord = { id: string; label: string; order: number; color?: string };

export type BoardRecord = {
  id: string;
  name: string;
  description?: string;
  columns: BoardColumnRecord[];
  createdAt: Date;
  updatedAt: Date;
};

export type BoardWithCardCount = BoardRecord & { cardCount: number };

const toColumnRecord = (column: BoardColumn): BoardColumnRecord => ({
  id: column._id.toString(),
  label: column.label,
  order: column.order,
  color: column.color,
});

const toRecord = (doc: BoardDocument): BoardRecord => ({
  id: doc._id.toString(),
  name: doc.name,
  description: doc.description,
  columns: doc.columns.map(toColumnRecord),
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

export type CreateBoardInput = {
  tenant: string;
  name: string;
  description?: string;
  columns: Array<{ label: string; color?: string }>;
};

// KAN-01: colunas iniciais entram na ordem em que chegam no payload (`order`
// = índice no array) — a validação de "ao menos 1 coluna" (KAN-02) é do
// service (T8), não deste repository.
export const createBoard = async (data: CreateBoardInput): Promise<BoardRecord> =>
  withDbTiming('board.createBoard', async () => {
    const doc = await Board.create({
      Tenant: data.tenant,
      name: data.name,
      description: data.description,
      columns: data.columns.map((column, index) => ({ label: column.label, color: column.color, order: index })),
    });
    return toRecord(doc.toObject());
  });

// Toda rota por :id passa por aqui: o filtro carrega o Tenant, então o id de
// outro tenant simplesmente não existe (AD-010) — mesmo padrão de
// professional.repository.findById.
export const findById = async (tenantId: string, id: string): Promise<BoardRecord | null> =>
  withDbTiming('board.findById', async () => {
    const doc = await Board.findOne(tenantScoped({ Tenant: tenantId, _id: id })).lean();
    return doc ? toRecord(doc) : null;
  });

// design.md Risk "N+1 ao listar boards com contagem de cards": 1 única
// aggregation ($lookup em cards + $count por sub-pipeline), nunca N chamadas.
// `$match` usa `$expr`+`$toString` em vez de `mongoose.Types.ObjectId(...)`
// de propósito: apps/crm-api não pode importar `mongoose` (AD-010, teste
// estrutural mongoose-boundary) — comparar o ObjectId armazenado como string
// evita precisar construir um ObjectId no lado do JS.
type BoardAggregateResult = BoardDocument & { cardCount: number };

export const listBoards = async (tenantId: string): Promise<BoardWithCardCount[]> =>
  withDbTiming('board.listBoards', async () => {
    const docs = await Board.aggregate<BoardAggregateResult>([
      { $match: { $expr: { $eq: [{ $toString: '$Tenant' }, tenantId] } } },
      {
        $lookup: {
          from: 'cards',
          let: { boardId: '$_id' },
          pipeline: [{ $match: { $expr: { $eq: ['$board', '$$boardId'] } } }, { $count: 'count' }],
          as: 'cardCounts',
        },
      },
      { $addFields: { cardCount: { $ifNull: [{ $arrayElemAt: ['$cardCounts.count', 0] }, 0] } } },
      { $sort: { updatedAt: -1 } }, // KAN-03: ordenado por atualização mais recente.
      { $project: { cardCounts: 0 } },
    ]);
    return docs.map((doc) => ({ ...toRecord(doc), cardCount: doc.cardCount }));
  });

export type UpdateBoardInput = { name?: string; description?: string };

// Só os campos informados entram no $set — mesmo padrão de
// professional.repository.updateProfessional.
export const updateBoard = async (
  tenantId: string,
  id: string,
  data: UpdateBoardInput,
): Promise<BoardRecord | null> =>
  withDbTiming('board.updateBoard', async () => {
    const update: Record<string, unknown> = {};
    if (data.name !== undefined) update.name = data.name;
    if (data.description !== undefined) update.description = data.description;

    const doc = await Board.findOneAndUpdate(tenantScoped({ Tenant: tenantId, _id: id }), update, {
      returnDocument: 'after',
    }).lean();
    return doc ? toRecord(doc) : null;
  });

// KAN-22 (cascata): quem chama esta função também precisa apagar os cards do
// board (card.repository.deleteAllByBoard, T7) — orquestrado pelo service
// (board.service.deleteBoard, T8), nunca aqui.
export const deleteBoard = async (tenantId: string, id: string): Promise<{ deletedCount: number }> =>
  withDbTiming('board.deleteBoard', async () => {
    const result = await Board.deleteOne(tenantScoped({ Tenant: tenantId, _id: id }));
    return { deletedCount: result.deletedCount ?? 0 };
  });

export type AddColumnInput = { label: string; color?: string };

// KAN-07: nova coluna sempre vai ao final da ordem atual — `order` calculado
// a partir do tamanho atual do array (leitura+escrita, não atômico; mesmo
// trade-off de concorrência já aceito no spec.md para este board livre).
export const addColumn = async (
  tenantId: string,
  boardId: string,
  column: AddColumnInput,
): Promise<BoardRecord | null> =>
  withDbTiming('board.addColumn', async () => {
    const board = await Board.findOne(tenantScoped({ Tenant: tenantId, _id: boardId }));
    if (!board) return null;
    // `_id` é gerado pelo default do subdocumento (design.md, "Identificador
    // de coluna") — o cast só contorna a exigência do TS de um `_id` já
    // presente no literal, o Mongoose preenche em runtime.
    board.columns.push({ label: column.label, color: column.color, order: board.columns.length } as BoardColumn);
    await board.save();
    return toRecord(board.toObject());
  });

export type UpdateColumnInput = { label?: string; color?: string };

// KAN-08/KAN-29: renomeia e/ou define a cor de UMA coluna via $set
// posicional (arrayFilters) — nunca mexe nos cards já associados a ela.
export const updateColumn = async (
  tenantId: string,
  boardId: string,
  columnId: string,
  data: UpdateColumnInput,
): Promise<BoardRecord | null> =>
  withDbTiming('board.updateColumn', async () => {
    const set: Record<string, unknown> = {};
    if (data.label !== undefined) set['columns.$[col].label'] = data.label;
    if (data.color !== undefined) set['columns.$[col].color'] = data.color;

    const doc = await Board.findOneAndUpdate(
      tenantScoped({ Tenant: tenantId, _id: boardId }),
      { $set: set },
      { arrayFilters: [{ 'col._id': columnId }], returnDocument: 'after' },
    ).lean();
    return doc ? toRecord(doc) : null;
  });

// KAN-09: recalcula `order` a partir da posição de cada id no array recebido
// — só as colunas presentes em `columnIds` são tocadas (nenhuma coluna some
// do board por causa de um payload de reorder incompleto).
export const reorderColumns = async (
  tenantId: string,
  boardId: string,
  columnIds: string[],
): Promise<BoardRecord | null> =>
  withDbTiming('board.reorderColumns', async () => {
    await Promise.all(
      columnIds.map((columnId, index) =>
        Board.updateOne(
          tenantScoped({ Tenant: tenantId, _id: boardId }),
          { $set: { 'columns.$[col].order': index } },
          { arrayFilters: [{ 'col._id': columnId }] },
        ),
      ),
    );
    return findById(tenantId, boardId);
  });

// KAN-10/KAN-11 (guard de coluna não-vazia / última coluna) são
// responsabilidade do service (board.service.removeColumn, T8) ANTES de
// chamar esta função — o repository só executa o $pull.
export const removeColumn = async (
  tenantId: string,
  boardId: string,
  columnId: string,
): Promise<BoardRecord | null> =>
  withDbTiming('board.removeColumn', async () => {
    const doc = await Board.findOneAndUpdate(
      tenantScoped({ Tenant: tenantId, _id: boardId }),
      { $pull: { columns: { _id: columnId } } },
      { returnDocument: 'after' },
    ).lean();
    return doc ? toRecord(doc) : null;
  });
