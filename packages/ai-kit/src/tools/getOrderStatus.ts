import { Order, Payment, type PaymentStatus, tenantScoped } from '@crm/db';
import type { ToolContext } from './toolContext.js';

export type GetOrderStatusInput = { orderId?: string };

// payments-asaas T19 (spec.md P1 AC5 / PAY-05): permite o modelo responder
// "já caiu?" sem uma tool nova — `payment` é OMITIDO por completo (não
// `undefined` explícito) quando o Order não tem nenhum Payment ainda, pra
// nunca mudar o formato do resultado pra quem não usa esta feature.
export type OrderSummary = {
  orderId: string;
  status: 'pending_approval' | 'confirmed' | 'rejected' | 'payment_expired';
  items: Array<{ productId: string; name: string; unitPrice: number; quantity: number }>;
  totalPrice: number;
  customerConfirmed: boolean;
  operatorApproved: boolean;
  payment?: { status: PaymentStatus; pixPayload?: string };
};

export type GetOrderStatusResult = OrderSummary | { error: string };

const toSummary = (
  order: {
    _id: { toString(): string };
    status: OrderSummary['status'];
    items: Array<{ product: { toString(): string }; name: string; unitPrice: number; quantity: number }>;
    totalPrice: number;
    customerConfirmed: boolean;
    operatorApproved: boolean;
  },
  payment?: { status: PaymentStatus; pixPayload?: string },
): OrderSummary => ({
  orderId: order._id.toString(),
  status: order.status,
  items: order.items.map((item) => ({
    productId: item.product.toString(),
    name: item.name,
    unitPrice: item.unitPrice,
    quantity: item.quantity,
  })),
  totalPrice: order.totalPrice,
  customerConfirmed: order.customerConfirmed,
  operatorApproved: order.operatorApproved,
  // Espalhado condicional (não `payment: payment && {...}`) — garante que a
  // CHAVE em si fique ausente do objeto quando não há Payment, não apenas
  // com valor `undefined` (Done-when T19: "field absent", verificado com
  // `in`/`Object.hasOwn` no teste, não só `toBe(undefined)`).
  ...(payment ? { payment } : {}),
});

// spec.md P1 "Cliente pesquisa produtos e consulta status do pedido"/AC3/AC4:
// com `orderId`, exige que o Order pertença à MESMA conversation do
// ToolContext (a query já filtra por isso — um id de outra conversation/
// tenant simplesmente não casa, nunca vaza dado de outro cliente, spec.md
// Edge Cases). Sem `orderId`, retorna o Order mais recente dessa conversation
// (createdAt desc, mesmo índice de listOrders/order.repository.ts). Nunca
// lança — ausência em qualquer um dos dois casos é {error}.
export const getOrderStatus = async (input: GetOrderStatusInput, ctx: ToolContext): Promise<GetOrderStatusResult> => {
  const order = input.orderId
    ? await Order.findOne(
        tenantScoped({ Tenant: ctx.tenantId, _id: input.orderId, conversation: ctx.conversationId }),
      ).lean()
    : await Order.findOne(tenantScoped({ Tenant: ctx.tenantId, conversation: ctx.conversationId }))
        .sort({ createdAt: -1 })
        .lean();

  if (!order) return { error: 'Pedido não encontrado' };

  // T19 (PAY-05): um extra Payment.findOne por order — nenhum padrão de
  // query novo (design.md Reuses), mesmo idioma tenantScoped já usado acima.
  const payment = await Payment.findOne(tenantScoped({ Tenant: ctx.tenantId, order: order._id })).lean();
  return toSummary(order, payment ? { status: payment.status, pixPayload: payment.pixPayload } : undefined);
};
