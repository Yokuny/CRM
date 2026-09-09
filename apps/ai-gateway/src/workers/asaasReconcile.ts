import type { AsaasClient } from '@crm/ai-kit';
import {
  AsaasEvent,
  type AsaasEventDocument,
  AsaasIntegration,
  type AsaasIntegrationDocument,
  applyAsaasPaymentStatus,
  expireOrderPayment,
  Payment,
  type PaymentDocument,
  tenantScoped,
} from '@crm/db';

// design.md Components "asaasReconcile.ts worker": webhook safety net
// (spec.md P1 "Webhook + rede de segurança"/AC6) + expiração automática
// (spec.md P1 "Cobrança não paga expira e libera o estoque"/AC1). Janela de
// 24h — assumption de spec.md, independente da validade própria do QR Pix do
// Asaas — exportada como constante simples (design.md Tech Decisions).
export const PAYMENT_EXPIRATION_HOURS = 24;

type StoredEventPayload = { payment?: { id?: string; status?: string } };

const isTransitionError = (result: { error: string } | unknown): result is { error: string } =>
  typeof result === 'object' && result !== null && 'error' in result;

// PAY-10a: retenta um AsaasEvent 'failed' a partir do PRÓPRIO payload já
// armazenado — nunca busca de novo no Asaas para este passo (o corpo bruto
// do webhook já é tudo que este passo precisa). Sucesso -> 'processed';
// falha renovada -> mantém 'failed', soma 1 em attempts e atualiza o erro
// (chamável repetidamente por ticks seguintes sem perder o histórico).
const retryFailedEvent = async (tenantId: string, event: AsaasEventDocument): Promise<void> => {
  try {
    const payload = event.payload as StoredEventPayload;
    const chargeId = payload?.payment?.id;
    if (!chargeId) throw new Error('AsaasEvent sem payment.id no payload armazenado');

    const payment = await Payment.findOne(tenantScoped({ Tenant: tenantId, asaasChargeId: chargeId })).lean();
    if (!payment) throw new Error('Payment não encontrado para este asaasChargeId');

    const result = await applyAsaasPaymentStatus(
      tenantId,
      payment._id.toString(),
      payload.payment?.status ?? 'PENDING',
      event.payload,
    );
    if (isTransitionError(result)) throw new Error(result.error);

    await AsaasEvent.updateOne({ _id: event._id }, { $set: { status: 'processed', processedAt: new Date() } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await AsaasEvent.updateOne({ _id: event._id }, { $set: { error: message }, $inc: { attempts: 1 } });
  }
};

// PAY-10b/PAY-11: consulta o Asaas ao vivo para TODO Payment pending (spec.md
// AC6 — leitura literal, ver commit/design.md "resolvido a favor do AC" —
// nunca só os "mais velhos que 24h", já que a consulta é um GET sem efeito
// colateral). O erro de getCharge/applyAsaasPaymentStatus é contido AQUI,
// por Payment — nunca propaga (um Payment com falha de rede não impede nem
// os outros Payments do mesmo tenant, nem a checagem de expiração abaixo).
// Expiração roda DEPOIS, sempre, independente do resultado do poll acima —
// expireOrderPayment já é seguro pra chamar em qualquer Payment (no-op se
// não estiver mais pending).
const pollPendingPayment = async (
  tenantId: string,
  integration: AsaasIntegrationDocument,
  payment: PaymentDocument,
  asaasClient: AsaasClient,
): Promise<void> => {
  try {
    const charge = await asaasClient.getCharge(integration, payment.asaasChargeId);
    await applyAsaasPaymentStatus(tenantId, payment._id.toString(), charge.asaasStatus, { source: 'reconciliation' });
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'asaas_reconcile.poll_failed',
        tenantId,
        paymentId: payment._id.toString(),
        message: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  const expirationThreshold = Date.now() - PAYMENT_EXPIRATION_HOURS * 60 * 60 * 1000;
  if (payment.createdAt.getTime() < expirationThreshold) {
    await expireOrderPayment(tenantId, payment._id.toString());
  }
};

export type AsaasReconcileDeps = { asaasClient: AsaasClient };

// Independente por tenant (design.md/spec.md Edge Cases: falha de um tenant
// nunca bloqueia o próximo) — mirrors outboxConsumer.ts's per-tick
// try/catch-and-log style, um nível acima (por INTEGRAÇÃO, não só por tick).
const processIntegration = async (integration: AsaasIntegrationDocument, asaasClient: AsaasClient): Promise<void> => {
  const tenantId = integration.Tenant.toString();
  try {
    const failedEvents = await AsaasEvent.find(tenantScoped({ Tenant: tenantId, status: 'failed' as const })).lean();
    for (const event of failedEvents) {
      await retryFailedEvent(tenantId, event);
    }

    const pendingPayments = await Payment.find(tenantScoped({ Tenant: tenantId, status: 'pending' as const })).lean();
    for (const payment of pendingPayments) {
      await pollPendingPayment(tenantId, integration, payment, asaasClient);
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'asaas_reconcile.tenant_failed',
        tenantId,
        message: err instanceof Error ? err.message : String(err),
      }),
    );
  }
};

// Núcleo testável de 1 tick (mesmo idioma de outboxConsumer.ts's
// processNextOutboxMessage) — startAsaasReconcile só embrulha isto num
// setInterval.
export const runAsaasReconcileTick = async (deps: AsaasReconcileDeps): Promise<void> => {
  const integrations = await AsaasIntegration.find({ status: 'active' }).lean();
  for (const integration of integrations) {
    await processIntegration(integration, deps.asaasClient);
  }
};

export type AsaasReconcileHandle = { stop: () => void };

// design.md: startAsaasReconcile(deps, intervalMs=300000) — mesma forma de
// setInterval/{stop} de reaper.ts/outboxConsumer.ts; deps carrega o
// AsaasClient injetado (design.md's próprio texto omite essa dependência
// óbvia — lida aqui como lacuna de documentação, seguindo o precedente
// estabelecido de outboxConsumer.ts em vez do texto literal).
export const startAsaasReconcile = (deps: AsaasReconcileDeps, intervalMs = 300000): AsaasReconcileHandle => {
  const handle = setInterval(() => {
    void runAsaasReconcileTick(deps).catch((err) => {
      console.error(
        JSON.stringify({
          event: 'asaas_reconcile.tick_failed',
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    });
  }, intervalMs);

  return { stop: () => clearInterval(handle) };
};
