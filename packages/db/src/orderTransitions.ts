import type { OrderDocument, OrderItem } from './models/order.model.js';
import { Order } from './models/order.model.js';
import { Product } from './models/product.model.js';
import { tenantScoped } from './tenantScoped.js';

// Única implementação da máquina de estados de Order (AD-033) — chamada por
// apps/crm-api (aprovar/rejeitar) e packages/ai-kit (2ª chamada de
// create_order), nunca duplicada.

export type OrderItemInput = { productId: string; quantity: number };
export type OrderTransitionResult = OrderDocument | { error: string };

const NOT_FOUND_ERROR = { error: 'Order não encontrado' };
const ALREADY_TERMINAL_ERROR = { error: 'Order já está em estado terminal' };

// Compara por (productId,quantity) como conjunto, não por ordem — o mesmo
// pedido pode ser resumido pela IA numa ordem diferente da gravada; o que
// importa (spec.md CAT-15) é que o CONJUNTO de itens bata exatamente.
const itemsMatch = (provided: OrderItemInput[], stored: OrderItem[]): boolean => {
  if (provided.length !== stored.length) return false;
  const storedByProduct = new Map(stored.map((item) => [item.product.toString(), item.quantity]));
  return provided.every((item) => storedByProduct.get(item.productId) === item.quantity);
};

// Reserva atomicamente (findOneAndUpdate condicional, stock:{$gte:quantity})
// o estoque de cada item do Order; se qualquer item falhar, desfaz ($inc
// positivo) só os itens já reservados NESTA tentativa — nunca um decremento
// parcial sobrevive (CAT-22). Chamada internamente por
// setCustomerConfirmed/setOperatorApproved quando as duas condições já se
// completaram, mas revalida existência/estado por poder ser chamada
// diretamente também.
export const tryConfirmOrder = async (tenantId: string, orderId: string): Promise<OrderTransitionResult> => {
  const order = await Order.findOne(tenantScoped({ Tenant: tenantId, _id: orderId })).lean();
  if (!order) return NOT_FOUND_ERROR;
  if (order.status !== 'pending_approval') return ALREADY_TERMINAL_ERROR;

  const reservedThisAttempt: { productId: string; quantity: number }[] = [];
  let failureReason: string | undefined;

  for (const item of order.items) {
    const productId = item.product.toString();
    const reserved = await Product.findOneAndUpdate(
      tenantScoped({ Tenant: tenantId, _id: productId, stock: { $gte: item.quantity } }),
      { $inc: { stock: -item.quantity } },
      { returnDocument: 'after' },
    ).lean();
    if (!reserved) {
      failureReason = `Estoque insuficiente para o produto "${item.name}"`;
      break;
    }
    reservedThisAttempt.push({ productId, quantity: item.quantity });
  }

  if (failureReason) {
    // Rollback compensatório: só os itens já reservados nesta tentativa —
    // nenhum decremento parcial sobrevive (CAT-22).
    await Promise.all(
      reservedThisAttempt.map((item) =>
        Product.updateOne(tenantScoped({ Tenant: tenantId, _id: item.productId }), { $inc: { stock: item.quantity } }),
      ),
    );
    const updated = await Order.findOneAndUpdate(
      tenantScoped({ Tenant: tenantId, _id: orderId, status: 'pending_approval' as const }),
      { $set: { confirmFailureReason: failureReason } },
      { returnDocument: 'after' },
    ).lean();
    return updated ?? NOT_FOUND_ERROR;
  }

  const confirmed = await Order.findOneAndUpdate(
    tenantScoped({ Tenant: tenantId, _id: orderId, status: 'pending_approval' as const }),
    { $set: { status: 'confirmed' as const }, $unset: { confirmFailureReason: '' } },
    { returnDocument: 'after' },
  ).lean();
  return confirmed ?? NOT_FOUND_ERROR;
};

// Valida que `items` bate exatamente com o Order pending_approval existente,
// marca customerConfirmed:true; se operatorApproved já é true nesse
// momento, tenta confirmar (CAT-14/CAT-21).
export const setCustomerConfirmed = async (
  tenantId: string,
  orderId: string,
  items: OrderItemInput[],
): Promise<OrderTransitionResult> => {
  const order = await Order.findOne(tenantScoped({ Tenant: tenantId, _id: orderId })).lean();
  if (!order) return NOT_FOUND_ERROR;
  if (order.status !== 'pending_approval') return ALREADY_TERMINAL_ERROR;
  if (!itemsMatch(items, order.items)) return { error: 'items divergem do Order original' };

  const updated = await Order.findOneAndUpdate(
    tenantScoped({ Tenant: tenantId, _id: orderId, status: 'pending_approval' as const }),
    { $set: { customerConfirmed: true } },
    { returnDocument: 'after' },
  ).lean();
  if (!updated) return NOT_FOUND_ERROR;

  if (updated.operatorApproved) return tryConfirmOrder(tenantId, orderId);
  return updated;
};

// Marca operatorApproved:true/approvedBy/approvedAt; se customerConfirmed já
// é true nesse momento, tenta confirmar (CAT-21).
export const setOperatorApproved = async (
  tenantId: string,
  orderId: string,
  userId: string,
): Promise<OrderTransitionResult> => {
  const order = await Order.findOne(tenantScoped({ Tenant: tenantId, _id: orderId })).lean();
  if (!order) return NOT_FOUND_ERROR;
  if (order.status !== 'pending_approval') return ALREADY_TERMINAL_ERROR;

  const updated = await Order.findOneAndUpdate(
    tenantScoped({ Tenant: tenantId, _id: orderId, status: 'pending_approval' as const }),
    { $set: { operatorApproved: true, approvedBy: userId, approvedAt: new Date() } },
    { returnDocument: 'after' },
  ).lean();
  if (!updated) return NOT_FOUND_ERROR;

  if (updated.customerConfirmed) return tryConfirmOrder(tenantId, orderId);
  return updated;
};

// status:'rejected', terminal, nunca toca estoque — nada foi reservado
// enquanto pending_approval (CAT-23).
export const rejectOrder = async (
  tenantId: string,
  orderId: string,
  userId: string,
  reason?: string,
): Promise<OrderTransitionResult> => {
  const updated = await Order.findOneAndUpdate(
    tenantScoped({ Tenant: tenantId, _id: orderId, status: 'pending_approval' as const }),
    { $set: { status: 'rejected' as const, rejectedBy: userId, rejectedAt: new Date(), rejectionReason: reason } },
    { returnDocument: 'after' },
  ).lean();
  return updated ?? NOT_FOUND_ERROR;
};
