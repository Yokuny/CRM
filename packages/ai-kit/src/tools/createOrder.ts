import type { OrderItem } from '@crm/db';
import { Conversation, Order, Product, setCustomerConfirmed, tenantScoped } from '@crm/db';
import type { OrderSummary } from './getOrderStatus.js';
import type { ToolContext } from './toolContext.js';

export type CreateOrderItemInput = { productId: string; quantity: number };
export type CreateOrderInput = {
  items: CreateOrderItemInput[];
  idempotencyKey: string;
  customerConfirmed?: boolean;
};
export type CreateOrderResult = OrderSummary | { error: string };

// design.md Tech Decisions: teto pra rejeitar entrada absurda, não uma regra
// de negócio.
const MIN_QUANTITY = 1;
const MAX_QUANTITY = 100;
const OBJECT_ID_REGEX = /^[0-9a-f]{24}$/i;

const isValidQuantity = (quantity: number): boolean =>
  Number.isInteger(quantity) && quantity >= MIN_QUANTITY && quantity <= MAX_QUANTITY;

// Compara por (productId,quantity) como conjunto — mesma semântica de
// orderTransitions.itemsMatch (packages/db/src/orderTransitions.ts), mas
// reimplementada AQUI porque aquele módulo só exporta as transições públicas,
// nunca esse helper interno. Usada só para decidir se uma 1ª chamada
// REPETIDA (mesma idempotencyKey acidentalmente reusada) é um retry
// idempotente (items idênticos, spec.md Edge Cases) ou uma colisão real
// (items diferentes) — a 2ª chamada de verdade (customerConfirmed:true) usa
// orderTransitions.setCustomerConfirmed diretamente, que já faz sua própria
// comparação internamente.
const itemsMatch = (provided: CreateOrderItemInput[], stored: OrderItem[]): boolean => {
  if (provided.length !== stored.length) return false;
  const storedByProduct = new Map(stored.map((item) => [item.product.toString(), item.quantity]));
  return provided.every((item) => storedByProduct.get(item.productId) === item.quantity);
};

// Mesmo formato de resumo de getOrderStatus.ts (design.md nomeia o mesmo tipo
// "OrderSummary" pros dois tools) — reimplementado localmente (em vez de
// importar a função de getOrderStatus.ts) porque T13 não deve tocar o
// arquivo de uma task anterior (T12) só pra exportar um helper compartilhado;
// o tipo `OrderSummary` em si é importado (não duplicado).
type OrderLike = {
  _id: { toString(): string };
  status: OrderSummary['status'];
  items: Array<{ product: { toString(): string }; name: string; unitPrice: number; quantity: number }>;
  totalPrice: number;
  customerConfirmed: boolean;
  operatorApproved: boolean;
};

const toSummary = (order: OrderLike): OrderSummary => ({
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

// 1ª chamada (sem customerConfirmed, ou false): valida cada item (productId
// existe e active, quantity inteiro 1..100) — qualquer item inválido rejeita
// SEM criar nada (spec.md AC2). spec.md Edge Cases: items vazio → {error};
// duas 1ªs chamadas acidentalmente com a MESMA idempotencyKey — items
// idênticos é um retry idempotente (devolve o Order já criado, sem duplicar),
// items diferentes é {error} sem sobrescrever a primeira (mesma regra de
// CAT-14/15, generalizada aqui pra colisão de 1ª chamada).
const handleCreationCall = async (input: CreateOrderInput, ctx: ToolContext): Promise<CreateOrderResult> => {
  if (input.items.length === 0) return { error: 'Nenhum item informado' };

  const snapshotItems: OrderItem[] = [];
  for (const item of input.items) {
    if (!isValidQuantity(item.quantity)) return { error: `Quantidade inválida para o produto ${item.productId}` };
    if (!OBJECT_ID_REGEX.test(item.productId)) return { error: `Produto ${item.productId} não encontrado` };

    const product = await Product.findOne(
      tenantScoped({ Tenant: ctx.tenantId, _id: item.productId, active: true }),
    ).lean();
    if (!product) return { error: `Produto ${item.productId} não encontrado ou inativo` };

    snapshotItems.push({
      product: product._id,
      name: product.name,
      unitPrice: product.price,
      quantity: item.quantity,
    });
  }

  const existing = await Order.findOne(
    tenantScoped({ Tenant: ctx.tenantId, conversation: ctx.conversationId, idempotencyKey: input.idempotencyKey }),
  ).lean();
  if (existing) {
    if (itemsMatch(input.items, existing.items)) return toSummary(existing);
    return { error: 'idempotencyKey já usada com items diferentes' };
  }

  // spec.md Edge Cases: Tenant/Customer da Conversation não bate mais com o
  // ToolContext (nunca deveria acontecer, defesa em profundidade) → {error},
  // nunca vaza dado de outro tenant.
  const conversation = await Conversation.findOne(
    tenantScoped({ Tenant: ctx.tenantId, _id: ctx.conversationId }),
  ).lean();
  if (!conversation) return { error: 'Conversa não encontrada' };

  const totalPrice = snapshotItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  const created = await Order.create({
    Tenant: ctx.tenantId,
    conversation: ctx.conversationId,
    customer: conversation.Customer,
    items: snapshotItems,
    totalPrice,
    status: 'pending_approval',
    idempotencyKey: input.idempotencyKey,
    customerConfirmed: false,
  });

  return toSummary(created);
};

// 2ª chamada (customerConfirmed:true): localiza o Order pending_approval
// criado na 1ª chamada por (Tenant, conversation, idempotencyKey) — chama
// orderTransitions.setCustomerConfirmed (AD-033), a MESMA função usada pelo
// lado do operador (apps/crm-api), pra marcar a confirmação e, se
// operatorApproved já for true, tentar confirmar. spec.md AC5: sem Order
// correspondente → {error}. spec.md AC6: Order já terminal
// (confirmed/rejected) → retorna o estado atual, sem mutar (leitura
// idempotente, não erro) — por isso NUNCA chama setCustomerConfirmed quando
// já é terminal, essa função devolveria um {error} genérico em vez do estado.
const handleConfirmationCall = async (input: CreateOrderInput, ctx: ToolContext): Promise<CreateOrderResult> => {
  const found = await Order.findOne(
    tenantScoped({ Tenant: ctx.tenantId, conversation: ctx.conversationId, idempotencyKey: input.idempotencyKey }),
  ).lean();
  if (!found) return { error: 'Nenhum pedido pendente encontrado para confirmar' };
  if (found.status !== 'pending_approval') return toSummary(found);

  const result = await setCustomerConfirmed(ctx.tenantId, found._id.toString(), input.items);
  if ('error' in result) return { error: result.error };
  return toSummary(result);
};

export const createOrder = async (input: CreateOrderInput, ctx: ToolContext): Promise<CreateOrderResult> =>
  input.customerConfirmed ? handleConfirmationCall(input, ctx) : handleCreationCall(input, ctx);
