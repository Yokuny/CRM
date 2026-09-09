import type { OrderDocument, OrderItem, OrderStatus } from '@crm/db';
import { Customer, Order, tenantScoped } from '@crm/db';
import { withDbTiming } from '../metrics/db.metric.js';

export type OrderItemRecord = { product: string; name: string; unitPrice: number; quantity: number };

export type OrderRecord = {
  id: string;
  conversation: string;
  customer: string;
  // Só preenchido por listOrders (populate 'customer','name') — design.md,
  // "Pedidos" screen e o card inline do Inbox (T22/T24, fase posterior)
  // precisam do nome sem uma segunda consulta.
  customerName?: string;
  items: OrderItemRecord[];
  totalPrice: number;
  status: OrderStatus;
  idempotencyKey: string;
  customerConfirmed: boolean;
  operatorApproved: boolean;
  approvedBy?: string;
  approvedAt?: Date;
  rejectedBy?: string;
  rejectedAt?: Date;
  rejectionReason?: string;
  confirmFailureReason?: string;
  createdAt: Date;
  updatedAt: Date;
};

const toItemRecord = (item: OrderItem): OrderItemRecord => ({
  product: item.product.toString(),
  name: item.name,
  unitPrice: item.unitPrice,
  quantity: item.quantity,
});

// customerId/customerName são passados explicitamente pelo chamador (em vez
// de lidos de doc.customer aqui dentro) porque doc.customer tem DOIS
// formatos possíveis conforme a query fez ou não .populate('customer','name')
// — findById nunca popula (ObjectId puro), listOrders sempre popula (vira
// {_id,name}). Manter a extração no call site evita este toRecord precisar
// adivinhar qual dos dois formatos recebeu.
const toRecord = (doc: OrderDocument, customerId: string, customerName?: string): OrderRecord => ({
  id: doc._id.toString(),
  conversation: doc.conversation.toString(),
  customer: customerId,
  customerName,
  items: doc.items.map(toItemRecord),
  totalPrice: doc.totalPrice,
  status: doc.status,
  idempotencyKey: doc.idempotencyKey,
  customerConfirmed: doc.customerConfirmed,
  operatorApproved: doc.operatorApproved,
  approvedBy: doc.approvedBy?.toString(),
  approvedAt: doc.approvedAt,
  rejectedBy: doc.rejectedBy?.toString(),
  rejectedAt: doc.rejectedAt,
  rejectionReason: doc.rejectionReason,
  confirmFailureReason: doc.confirmFailureReason,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

// Toda rota por :id passa por aqui: o filtro carrega o Tenant, então um id de
// outro tenant simplesmente não existe (AD-010) — mesmo padrão de
// product.repository.findById.
export const findById = async (tenantId: string, id: string): Promise<OrderRecord | null> =>
  withDbTiming('order.findById', async () => {
    const doc = await Order.findOne(tenantScoped({ Tenant: tenantId, _id: id })).lean();
    return doc ? toRecord(doc, doc.customer.toString()) : null;
  });

export type ListOrdersInput = { page: number; limit: number; status?: OrderStatus; conversation?: string };
export type ListOrdersResult = { items: OrderRecord[]; total: number };

// spec.md P1 "Operador aprova ou rejeita": filtro por status (default nenhum
// — todos, o default 'pending_approval' do endpoint é aplicado no router/T10,
// não aqui) e conversation opcional (T24, card inline do Inbox de UMA
// conversation). Ordena por createdAt desc — mesmo índice já existente
// {Tenant,status,createdAt:-1} (order.model.ts, "fila de Pedidos"). Nome do
// cliente resolvido por uma segunda consulta em lote (mesmo padrão de
// conversation.service.ts#attachAssigneeNames), não por Mongoose populate() —
// populate() sobrescreve o campo customer com `null` quando o Customer
// referenciado não existe mais, perdendo o ObjectId original; a segunda
// consulta preserva o id sempre, com o nome como um extra best-effort.
export const listOrders = async (tenantId: string, query: ListOrdersInput): Promise<ListOrdersResult> =>
  withDbTiming('order.listOrders', async () => {
    const statusFilter = query.status ? { status: query.status } : {};
    const conversationFilter = query.conversation ? { conversation: query.conversation } : {};
    const filter = tenantScoped({ Tenant: tenantId, ...statusFilter, ...conversationFilter });

    const skip = (query.page - 1) * query.limit;
    const [docs, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit).lean(),
      Order.countDocuments(filter),
    ]);

    const customerIds = [...new Set(docs.map((doc) => doc.customer.toString()))];
    const customers = customerIds.length
      ? await Customer.find(tenantScoped({ Tenant: tenantId, _id: { $in: customerIds } }))
          .select('name')
          .lean()
      : [];
    const nameById = new Map(customers.map((customer) => [customer._id.toString(), customer.name]));

    const items = docs.map((doc) => toRecord(doc, doc.customer.toString(), nameById.get(doc.customer.toString())));
    return { items, total };
  });
