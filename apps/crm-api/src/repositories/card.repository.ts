import type { CardDocument, OrderStatus } from '@crm/db';
import { Card, Customer, FieldTemplate, Order, Process, tenantScoped, User } from '@crm/db';
import { withDbTiming } from '../metrics/db.metric.js';

export type CardRecord = {
  id: string;
  board: string;
  column: string;
  title: string;
  description?: string;
  position: number;
  customer?: string;
  // Campos de exibição (KAN-24..28) — só preenchidos por listByBoard
  // (join em lote, nunca `.populate()`: mesmo cuidado de
  // order.repository.ts/appointment.repository.ts, um Customer/Process/
  // Order/User referenciado que sumisse perderia o ObjectId original com
  // `.populate()`). Ausentes, nunca `null`, em createCard/findById/
  // updateCard/moveCard.
  customerName?: string;
  process?: string;
  processStage?: string;
  processTemplateName?: string;
  order?: string;
  orderTotalPrice?: number;
  orderStatus?: OrderStatus;
  assignee?: string;
  assigneeName?: string;
  createdAt: Date;
  updatedAt: Date;
};

type CardDisplayInfo = {
  customerName?: string;
  processStage?: string;
  processTemplateName?: string;
  orderTotalPrice?: number;
  orderStatus?: OrderStatus;
  assigneeName?: string;
};

const toRecord = (doc: CardDocument, display: CardDisplayInfo = {}): CardRecord => ({
  id: doc._id.toString(),
  board: doc.board.toString(),
  column: doc.column.toString(),
  title: doc.title,
  description: doc.description,
  position: doc.position,
  customer: doc.customer?.toString(),
  customerName: display.customerName,
  process: doc.process?.toString(),
  processStage: display.processStage,
  processTemplateName: display.processTemplateName,
  order: doc.order?.toString(),
  orderTotalPrice: display.orderTotalPrice,
  orderStatus: display.orderStatus,
  assignee: doc.assignee?.toString(),
  assigneeName: display.assigneeName,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

export type CreateCardInput = {
  tenant: string;
  board: string;
  column: string;
  title: string;
  description?: string;
  position: number;
  customer?: string;
  process?: string;
  order?: string;
  assignee?: string;
};

// `position` chega já calculado pelo service (T9, sempre ao final da
// coluna) — este repositório confia nele, nunca recalcula.
export const createCard = async (data: CreateCardInput): Promise<CardRecord> =>
  withDbTiming('card.createCard', async () => {
    const doc = await Card.create({
      Tenant: data.tenant,
      board: data.board,
      column: data.column,
      title: data.title,
      description: data.description,
      position: data.position,
      customer: data.customer,
      process: data.process,
      order: data.order,
      assignee: data.assignee,
    });
    return toRecord(doc.toObject());
  });

const uniqueIds = (values: Array<string | undefined>): string[] => [...new Set(values.filter((v): v is string => !!v))];

// design.md Tech Decisions "Populate de referências do Card pra exibição":
// join em lote (3 consultas + 1 extra pra template.name do Process — nunca
// N+1 por card), retornando só os campos necessários (KAN-24..28) — nunca o
// documento cru do Customer/Process/Order/User (evita vazar `values` do
// Process ou `password`/`email` do User).
export const listByBoard = async (tenantId: string, boardId: string): Promise<CardRecord[]> =>
  withDbTiming('card.listByBoard', async () => {
    const filter = tenantScoped({ Tenant: tenantId, board: boardId });
    const docs = await Card.find(filter).sort({ column: 1, position: 1 }).lean();

    const customerIds = uniqueIds(docs.map((d) => d.customer?.toString()));
    const processIds = uniqueIds(docs.map((d) => d.process?.toString()));
    const orderIds = uniqueIds(docs.map((d) => d.order?.toString()));
    const assigneeIds = uniqueIds(docs.map((d) => d.assignee?.toString()));

    const [customers, processes, orders, assignees] = await Promise.all([
      customerIds.length
        ? Customer.find(tenantScoped({ Tenant: tenantId, _id: { $in: customerIds } }))
            .select('name')
            .lean()
        : [],
      processIds.length
        ? Process.find(tenantScoped({ Tenant: tenantId, _id: { $in: processIds } }))
            .select('stage template')
            .lean()
        : [],
      orderIds.length
        ? Order.find(tenantScoped({ Tenant: tenantId, _id: { $in: orderIds } }))
            .select('totalPrice status')
            .lean()
        : [],
      assigneeIds.length
        ? User.find(tenantScoped({ Tenant: tenantId, _id: { $in: assigneeIds } }))
            .select('name')
            .lean()
        : [],
    ]);

    const templateIds = uniqueIds(processes.map((p) => p.template.toString()));
    const templates = templateIds.length
      ? await FieldTemplate.find(tenantScoped({ Tenant: tenantId, _id: { $in: templateIds } }))
          .select('name')
          .lean()
      : [];

    const customerNameById = new Map(customers.map((c) => [c._id.toString(), c.name]));
    const templateNameById = new Map(templates.map((t) => [t._id.toString(), t.name]));
    const processById = new Map(
      processes.map((p) => [
        p._id.toString(),
        { stage: p.stage, templateName: templateNameById.get(p.template.toString()) },
      ]),
    );
    const orderById = new Map(orders.map((o) => [o._id.toString(), { totalPrice: o.totalPrice, status: o.status }]));
    const assigneeNameById = new Map(assignees.map((u) => [u._id.toString(), u.name]));

    return docs.map((doc) =>
      toRecord(doc, {
        customerName: doc.customer ? customerNameById.get(doc.customer.toString()) : undefined,
        processStage: doc.process ? processById.get(doc.process.toString())?.stage : undefined,
        processTemplateName: doc.process ? processById.get(doc.process.toString())?.templateName : undefined,
        orderTotalPrice: doc.order ? orderById.get(doc.order.toString())?.totalPrice : undefined,
        orderStatus: doc.order ? orderById.get(doc.order.toString())?.status : undefined,
        assigneeName: doc.assignee ? assigneeNameById.get(doc.assignee.toString()) : undefined,
      }),
    );
  });

// Toda rota por :id passa por aqui: o filtro carrega Tenant+board, então um
// cardId de outro board/tenant simplesmente não existe (AD-010).
export const findById = async (tenantId: string, boardId: string, cardId: string): Promise<CardRecord | null> =>
  withDbTiming('card.findById', async () => {
    const doc = await Card.findOne(tenantScoped({ Tenant: tenantId, board: boardId, _id: cardId })).lean();
    return doc ? toRecord(doc) : null;
  });

export type UpdateCardInput = {
  title?: string;
  description?: string;
  customer?: string;
  process?: string;
  order?: string;
  assignee?: string;
};

// Só os campos informados entram no $set (KAN-16: nunca aceita column/
// position — nem chega a este tipo, o contrato já os omite) — mesmo padrão
// de professional.repository.updateProfessional.
export const updateCard = async (
  tenantId: string,
  boardId: string,
  cardId: string,
  data: UpdateCardInput,
): Promise<CardRecord | null> =>
  withDbTiming('card.updateCard', async () => {
    const update: Record<string, unknown> = {};
    if (data.title !== undefined) update.title = data.title;
    if (data.description !== undefined) update.description = data.description;
    if (data.customer !== undefined) update.customer = data.customer;
    if (data.process !== undefined) update.process = data.process;
    if (data.order !== undefined) update.order = data.order;
    if (data.assignee !== undefined) update.assignee = data.assignee;

    const doc = await Card.findOneAndUpdate(tenantScoped({ Tenant: tenantId, board: boardId, _id: cardId }), update, {
      returnDocument: 'after',
    }).lean();
    return doc ? toRecord(doc) : null;
  });

// KAN-18/19/21: a validação de que `column` existe em board.columns é do
// service (card.service.moveCard, T9) ANTES de chamar esta função — o
// repository só persiste a nova coluna/posição.
export const moveCard = async (
  tenantId: string,
  boardId: string,
  cardId: string,
  column: string,
  position: number,
): Promise<CardRecord | null> =>
  withDbTiming('card.moveCard', async () => {
    const doc = await Card.findOneAndUpdate(
      tenantScoped({ Tenant: tenantId, board: boardId, _id: cardId }),
      { column, position },
      { returnDocument: 'after' },
    ).lean();
    return doc ? toRecord(doc) : null;
  });

export const deleteCard = async (
  tenantId: string,
  boardId: string,
  cardId: string,
): Promise<{ deletedCount: number }> =>
  withDbTiming('card.deleteCard', async () => {
    const result = await Card.deleteOne(tenantScoped({ Tenant: tenantId, board: boardId, _id: cardId }));
    return { deletedCount: result.deletedCount ?? 0 };
  });

// KAN-10: usado por board.service.removeColumn (T8) pra bloquear a remoção
// de uma coluna que ainda tem card(s).
export const existsInColumn = async (tenantId: string, boardId: string, columnId: string): Promise<boolean> =>
  withDbTiming('card.existsInColumn', async () => {
    const count = await Card.countDocuments(tenantScoped({ Tenant: tenantId, board: boardId, column: columnId }));
    return count > 0;
  });

// KAN-22 (cascata): chamado por board.service.deleteBoard (T8) DEPOIS de
// confirmar que o board foi apagado.
export const deleteAllByBoard = async (tenantId: string, boardId: string): Promise<{ deletedCount: number }> =>
  withDbTiming('card.deleteAllByBoard', async () => {
    const result = await Card.deleteMany(tenantScoped({ Tenant: tenantId, board: boardId }));
    return { deletedCount: result.deletedCount ?? 0 };
  });
