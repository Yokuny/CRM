import type { OrderDocument, OrderItem, OrderStatus, PaymentStatus } from '@crm/db';
import { Customer, Order, Payment, tenantScoped, User } from '@crm/db';
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
  // Só preenchido quando existe um Payment para este Order (design.md P2,
  // AD-034: crm-api só LÊ Payment, nunca escreve) — ausente, nunca `null`,
  // quando não há Payment.
  paymentStatus?: PaymentStatus;
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
const toRecord = (
  doc: OrderDocument,
  customerId: string,
  customerName?: string,
  paymentStatus?: PaymentStatus,
): OrderRecord => ({
  id: doc._id.toString(),
  conversation: doc.conversation.toString(),
  customer: customerId,
  customerName,
  paymentStatus,
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
    if (!doc) return null;
    // Leitura única, best-effort (design.md P2 AC1) — nunca escreve em
    // Payment aqui (AD-034).
    const payment = await Payment.findOne(tenantScoped({ Tenant: tenantId, order: doc._id }))
      .select('status')
      .lean();
    return toRecord(doc, doc.customer.toString(), undefined, payment?.status);
  });

// Pagamento como a tela de detalhe precisa: sem o QR em base64 (pesado; o
// copia-e-cola basta pra reenviar) e sem `pixExpirationDate`, que é a
// validade do QR no Asaas, não a expiração que o sistema aplica.
export type OrderPaymentRecord = {
  status: PaymentStatus;
  value: number;
  billingType: 'PIX';
  pixPayload?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type OrderDetailRecord = OrderRecord & {
  customerPhone?: string;
  approvedByName?: string;
  rejectedByName?: string;
  payment?: OrderPaymentRecord;
};

// Tela de detalhe de UM pedido: o Order + o que ele só referencia por id
// (cliente, pagamento, quem aprovou/rejeitou), cada um numa consulta
// paralela e best-effort — referência que não existe mais vira campo
// ausente, nunca erro (mesmo motivo de listOrders não usar populate()).
export const findDetailById = async (tenantId: string, id: string): Promise<OrderDetailRecord | null> =>
  withDbTiming('order.findDetailById', async () => {
    const doc = await Order.findOne(tenantScoped({ Tenant: tenantId, _id: id })).lean();
    if (!doc) return null;

    const userIds = [doc.approvedBy, doc.rejectedBy].filter((userId) => userId !== undefined);
    const [customer, payment, users] = await Promise.all([
      Customer.findOne(tenantScoped({ Tenant: tenantId, _id: doc.customer }))
        .select('name phone')
        .lean(),
      Payment.findOne(tenantScoped({ Tenant: tenantId, order: doc._id }))
        .select('status value billingType pixPayload createdAt updatedAt')
        .lean(),
      userIds.length
        ? User.find(tenantScoped({ Tenant: tenantId, _id: { $in: userIds } }))
            .select('name')
            .lean()
        : [],
    ]);
    const userNameById = new Map(users.map((user) => [user._id.toString(), user.name]));

    return {
      ...toRecord(doc, doc.customer.toString(), customer?.name, payment?.status),
      customerPhone: customer?.phone,
      approvedByName: doc.approvedBy ? userNameById.get(doc.approvedBy.toString()) : undefined,
      rejectedByName: doc.rejectedBy ? userNameById.get(doc.rejectedBy.toString()) : undefined,
      payment: payment
        ? {
            status: payment.status,
            value: payment.value,
            billingType: payment.billingType,
            pixPayload: payment.pixPayload,
            createdAt: payment.createdAt,
            updatedAt: payment.updatedAt,
          }
        : undefined,
    };
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
    const orderIds = docs.map((doc) => doc._id);
    const [customers, payments] = await Promise.all([
      customerIds.length
        ? Customer.find(tenantScoped({ Tenant: tenantId, _id: { $in: customerIds } }))
            .select('name')
            .lean()
        : [],
      // Mesmo padrão em lote de nameById logo abaixo — NUNCA populate()
      // (perderia o order id de um Payment órfão) nem N+1 (design.md P2
      // AD-034: crm-api só LÊ Payment aqui).
      orderIds.length
        ? Payment.find(tenantScoped({ Tenant: tenantId, order: { $in: orderIds } }))
            .select('order status')
            .lean()
        : [],
    ]);
    const nameById = new Map(customers.map((customer) => [customer._id.toString(), customer.name]));
    const paymentStatusById = new Map(payments.map((payment) => [payment.order.toString(), payment.status]));

    const items = docs.map((doc) =>
      toRecord(
        doc,
        doc.customer.toString(),
        nameById.get(doc.customer.toString()),
        paymentStatusById.get(doc._id.toString()),
      ),
    );
    return { items, total };
  });
