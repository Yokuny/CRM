import { Order, tenantScoped } from '@crm/db';
import type { ToolContext } from './toolContext.js';

export type GetOrderStatusInput = { orderId?: string };

export type OrderSummary = {
  orderId: string;
  status: 'pending_approval' | 'confirmed' | 'rejected';
  items: Array<{ productId: string; name: string; unitPrice: number; quantity: number }>;
  totalPrice: number;
  customerConfirmed: boolean;
  operatorApproved: boolean;
};

export type GetOrderStatusResult = OrderSummary | { error: string };

const toSummary = (order: {
  _id: { toString(): string };
  status: OrderSummary['status'];
  items: Array<{ product: { toString(): string }; name: string; unitPrice: number; quantity: number }>;
  totalPrice: number;
  customerConfirmed: boolean;
  operatorApproved: boolean;
}): OrderSummary => ({
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
  return toSummary(order);
};
