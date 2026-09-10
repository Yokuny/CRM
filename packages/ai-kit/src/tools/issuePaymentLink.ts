import { AsaasIntegration, Customer, Order, Payment, type PaymentStatus, tenantScoped } from '@crm/db';
import type { ToolContext } from './toolContext.js';

export type IssuePaymentLinkInput = { orderId: string };

export type IssuePaymentLinkResult =
  | {
      orderId: string;
      status: PaymentStatus;
      billingType: 'PIX';
      totalPrice: number;
      pixPayload?: string;
      pixEncodedImage?: string;
    }
  | { error: string };

// Mesmo check de ingest.ts:79-80 (não exportado de lá — reimplementado aqui
// verbatim, design.md "Reuses"), pra tratar a corrida entre o findOne do passo
// 3 e o create do passo 8: outra chamada concorrente já criou o Payment deste
// Order entre a leitura e a escrita.
const isDuplicateKeyError = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 11000;

// PIX é pago imediatamente — este `dueDate` é só o campo obrigatório do
// Asaas, independente da janela de expiração de 24h do NEGÓCIO
// (PAYMENT_EXPIRATION_HOURS, paymentTransitions.ts).
const todayIsoDate = (): string => new Date().toISOString().slice(0, 10);

type PaymentLike = {
  status: PaymentStatus;
  value: number;
  pixPayload?: string;
  pixEncodedImage?: string;
};

const toResult = (orderId: string, payment: PaymentLike): IssuePaymentLinkResult => ({
  orderId,
  status: payment.status,
  billingType: 'PIX',
  totalPrice: payment.value,
  pixPayload: payment.pixPayload,
  pixEncodedImage: payment.pixEncodedImage,
});

// issuePaymentLink: tool Anel B (AD-009) — emite UMA cobrança PIX pra um
// Order já `confirmed`. Ordem dos passos segue design.md Components/spec.md
// P1 "Cliente paga um pedido confirmado via PIX":
// 1) Order tenant/conversation-scoped (mesmo idioma de defesa em
//    profundidade de createOrder.ts) — id de outro tenant/conversation nunca
//    bate, {error} (spec.md Edge Cases).
// 2) status !== 'confirmed' => {error}, gate ESTRUTURAL, verificado ANTES de
//    qualquer outra coisa — zero chamada Asaas, zero Payment (PAY-02).
// 3) Payment já existe pra este Order => devolve o estado ATUAL dele, SEM
//    chamar ctx.asaasClient (PAY-03, idempotência).
// 4)/5) sem AsaasIntegration ativa OU sem ctx.asaasClient injetado => {error},
//    zero chamada Asaas (PAY-04) — as duas situações são tratadas como o
//    mesmo caso (nenhuma integração utilizável).
// 6) Customer sem asaasCustomerId => cria via ensureCustomer, persiste de
//    volta no Customer pra reuso futuro.
// 7) createPixCharge — falha aqui => {error}, NENHUM Payment persistido (sem
//    estado parcial órfão, spec.md Edge Cases).
// 8) Payment.create — corrida de chave duplicada (outra chamada concorrente
//    venceu entre o passo 3 e aqui) => rebusca e devolve o Payment existente,
//    em vez de lançar.
export const issuePaymentLink = async (
  input: IssuePaymentLinkInput,
  ctx: ToolContext,
): Promise<IssuePaymentLinkResult> => {
  const order = await Order.findOne(
    tenantScoped({ Tenant: ctx.tenantId, _id: input.orderId, conversation: ctx.conversationId }),
  ).lean();
  if (!order) return { error: 'Pedido não encontrado' };
  if (order.status !== 'confirmed') return { error: 'Pedido ainda não está confirmado' };

  const orderId = order._id.toString();

  const existingPayment = await Payment.findOne(tenantScoped({ Tenant: ctx.tenantId, order: order._id })).lean();
  if (existingPayment) return toResult(orderId, existingPayment);

  const integration = await AsaasIntegration.findOne(
    tenantScoped({ Tenant: ctx.tenantId, status: 'active' as const }),
  ).lean();
  if (!integration || !ctx.asaasClient) return { error: 'Pagamento via Asaas não está disponível para este tenant' };
  const asaasClient = ctx.asaasClient;

  const customer = await Customer.findOne(tenantScoped({ Tenant: ctx.tenantId, _id: order.customer })).lean();
  if (!customer) return { error: 'Cliente do pedido não encontrado' };

  let asaasCustomerId = customer.asaasCustomerId;
  if (!asaasCustomerId) {
    const ensured = await asaasClient.ensureCustomer(integration, {
      name: customer.name,
      phone: customer.phone,
      document: customer.document,
    });
    asaasCustomerId = ensured.asaasCustomerId;
    await Customer.updateOne(tenantScoped({ Tenant: ctx.tenantId, _id: customer._id }), { $set: { asaasCustomerId } });
  }

  let charge: Awaited<ReturnType<typeof asaasClient.createPixCharge>>;
  try {
    charge = await asaasClient.createPixCharge(integration, {
      asaasCustomerId,
      value: order.totalPrice,
      description: `Pedido ${orderId}`,
      dueDate: todayIsoDate(),
    });
  } catch {
    return { error: 'Falha ao criar cobrança no Asaas' };
  }

  try {
    const payment = await Payment.create({
      Tenant: ctx.tenantId,
      order: order._id,
      asaasChargeId: charge.asaasChargeId,
      asaasCustomerId,
      billingType: 'PIX',
      value: order.totalPrice,
      status: 'pending',
      asaasStatus: 'PENDING',
      pixPayload: charge.pixPayload,
      pixEncodedImage: charge.pixEncodedImage,
      pixExpirationDate: charge.pixExpirationDate,
    });
    return toResult(orderId, payment);
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      const raced = await Payment.findOne(tenantScoped({ Tenant: ctx.tenantId, order: order._id })).lean();
      if (raced) return toResult(orderId, raced);
    }
    return { error: 'Falha ao registrar o pagamento' };
  }
};
