import { Order } from './models/order.model.js';
import type { PaymentDocument, PaymentStatus } from './models/payment.model.js';
import { Payment } from './models/payment.model.js';
import { Product } from './models/product.model.js';
import { tenantScoped } from './tenantScoped.js';

// Transição de negócio multi-documento (Payment/Order/Product) do domínio de
// pagamento (AD-034, seguindo o precedente de orderTransitions.ts/AD-033) —
// chamada tanto pelo webhook receiver quanto pelo worker de reconciliação do
// ai-gateway, nunca duplicada.

export type PaymentTransitionResult = PaymentDocument | { error: string };

const NOT_FOUND_ERROR = { error: 'Payment não encontrado' };

// Rank do status de domínio — usado só para bloquear DOWNGRADE (spec.md P1
// "Webhook + rede de segurança"/AC4). 'pending' é o único rank não-terminal:
// dele qualquer status mapeado é aplicado. A partir de qualquer terminal
// (paid/refunded/canceled/expired), só um rank ESTRITAMENTE maior é aplicado
// — ex.: paid -> refunded/canceled é uma progressão legítima (cobrança paga
// e depois estornada/chargeback), mas paid nunca regride para pending, e
// refunded/canceled/expired nunca são sobrescritos por nada (mesmo rank ou
// menor). 'expired' é definido no rank mais alto porque spec.md declara um
// Payment expirado terminal para esta feature (Out of Scope: "Re-issuing a
// charge after expiration").
const STATUS_RANK: Record<PaymentStatus, number> = {
  pending: 0,
  paid: 1,
  refunded: 2,
  canceled: 2,
  expired: 2,
};

// Mapeia o status bruto do Asaas (design.md, Asaas API facts) para o enum de
// domínio. PENDING/OVERDUE e qualquer status não reconhecido (payloads do
// Asaas evoluem, spec.md Edge Cases) caem no default 'pending' — o rank mais
// baixo, então nunca derruba um status já terminal e nunca lança.
const mapAsaasStatus = (asaasStatus: string): PaymentStatus => {
  switch (asaasStatus) {
    case 'RECEIVED':
    case 'CONFIRMED':
      return 'paid';
    case 'REFUNDED':
    case 'REFUND_REQUESTED':
    case 'REFUND_IN_PROGRESS':
      return 'refunded';
    case 'CHARGEBACK_REQUESTED':
    case 'CHARGEBACK_DISPUTE':
    case 'AWAITING_CHARGEBACK_REVERSAL':
      return 'canceled';
    default:
      return 'pending';
  }
};

// Aplica o status de uma cobrança Asaas ao Payment, nunca fazendo downgrade
// (spec.md P1 "Webhook + rede de segurança"/AC4) — usada tanto pelo webhook
// (asaasWebhook.router.ts, T22) quanto pelo worker de reconciliação
// (asaasReconcile.ts, T24), garantindo que o invariante "nunca downgrade"
// viva neste único lugar. `raw` é aceito pela assinatura (design.md
// Components) para uso futuro de diagnóstico pelos chamadores — o payload
// bruto do webhook já é persistido separadamente em AsaasEvent.payload.
export const applyAsaasPaymentStatus = async (
  tenantId: string,
  paymentId: string,
  asaasStatus: string,
  raw: unknown,
): Promise<PaymentTransitionResult> => {
  void raw;
  const current = await Payment.findOne(tenantScoped({ Tenant: tenantId, _id: paymentId })).lean();
  if (!current) return NOT_FOUND_ERROR;

  const mapped = mapAsaasStatus(asaasStatus);
  const shouldApply = current.status === 'pending' || STATUS_RANK[mapped] > STATUS_RANK[current.status];
  if (!shouldApply) return current;

  const updated = await Payment.findOneAndUpdate(
    tenantScoped({ Tenant: tenantId, _id: paymentId }),
    { $set: { status: mapped, asaasStatus } },
    { returnDocument: 'after' },
  ).lean();
  return updated ?? NOT_FOUND_ERROR;
};

// Expira um Payment ainda pending, liberando o estoque reservado de cada item
// do Order (mesma forma de findOneAndUpdate por item de tryConfirmOrder,
// orderTransitions.ts, aplicada como $inc positivo — sempre bem-sucedido, já
// que nada mais pode ter reconsumido estoque reservado enquanto o Order
// seguia 'confirmed') e marcando Order.status:'payment_expired' (spec.md P1
// "Cobrança não paga expira e libera o estoque"/AC1). No-op seguro (retorna o
// estado atual) se o Payment já saiu de pending — chamável repetidamente por
// um tick de reconciliação retentado sem liberar estoque duas vezes.
export const expireOrderPayment = async (tenantId: string, paymentId: string): Promise<PaymentTransitionResult> => {
  const payment = await Payment.findOne(tenantScoped({ Tenant: tenantId, _id: paymentId })).lean();
  if (!payment) return NOT_FOUND_ERROR;
  if (payment.status !== 'pending') return payment;

  const order = await Order.findOne(tenantScoped({ Tenant: tenantId, _id: payment.order })).lean();
  if (!order) return NOT_FOUND_ERROR;

  // Portão atômico: só um chamador consegue virar pending->expired; uma 2ª
  // chamada concorrente encontra status:'pending' já não bater e recebe null
  // aqui, retornando sem liberar estoque uma segunda vez.
  const expired = await Payment.findOneAndUpdate(
    tenantScoped({ Tenant: tenantId, _id: paymentId, status: 'pending' as const }),
    { $set: { status: 'expired' as const } },
    { returnDocument: 'after' },
  ).lean();
  if (!expired) return payment;

  await Promise.all(
    order.items.map((item) =>
      Product.updateOne(tenantScoped({ Tenant: tenantId, _id: item.product }), { $inc: { stock: item.quantity } }),
    ),
  );
  await Order.updateOne(tenantScoped({ Tenant: tenantId, _id: order._id }), {
    $set: { status: 'payment_expired' as const },
  });

  return expired;
};
