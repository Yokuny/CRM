import { respObj } from '@crm/contracts';
import { AsaasEvent, applyAsaasPaymentStatus, Payment, tenantScoped } from '@crm/db';
import express, { type Response, Router } from 'express';
import {
  type AsaasWebhookRequest,
  createAsaasWebhookAuthMiddleware,
} from '../middlewares/asaasWebhookAuth.middleware.js';
import type { RawBodyRequest } from '../middlewares/webhookSignature.middleware.js';

// Shape mínima do payload do Asaas necessária pra dedup + dispatch
// (design.md, Asaas API facts: `{id, event, dateCreated, payment: {...}}`) —
// nunca parseado estritamente (spec.md Edge Cases: payloads evoluem, tolera
// campo ausente/desconhecido sem lançar).
type AsaasWebhookBody = {
  id?: string;
  event?: string;
  payment?: { id?: string; status?: string };
};

// Mesmo check de ingest.ts:79-80 (reimplementado verbatim, design.md
// "Reuses") — distingue um E11000 real (evento já visto, PAY-07) de
// qualquer outro erro de escrita.
const isDuplicateKeyError = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 11000;

// `id` do próprio Asaas é o dedup key; sem ele, fallback sintetizado
// (spec.md Edge Cases) — limitação documentada, aceita.
const deriveDedupKey = (body: AsaasWebhookBody): string =>
  body.id ?? `${body.event ?? 'unknown'}:${body.payment?.id ?? 'unknown'}:${body.payment?.status ?? 'unknown'}`;

// PAY-06/07/08/09: sempre responde 200 (mirrors webhook.router.ts's
// handleIncoming) — Asaas retenta agressivamente qualquer coisa != 2xx
// (design.md Asaas API facts). Dedup por asaasEventId (E11000, PAY-07) e o
// guard de rank (PAY-08) vivem, respectivamente, no índice único de
// AsaasEvent e em applyAsaasPaymentStatus (paymentTransitions.ts,
// já testado na Fase 1) — este handler só precisa CHAMAR essas peças
// corretamente, nunca reimplementá-las.
const handleIncoming = () => {
  return async (req: AsaasWebhookRequest, res: Response): Promise<void> => {
    const integration = req.asaasIntegration;
    // Sempre presente aqui — createAsaasWebhookAuthMiddleware já garantiu
    // isso antes de chamar next() (guard defensivo, nunca deveria disparar).
    if (!integration) {
      res.status(200).json(respObj({}));
      return;
    }

    const body = (req.body ?? {}) as AsaasWebhookBody;
    const dedupKey = deriveDedupKey(body);

    let createdEventId: string;
    try {
      const createdEvent = await AsaasEvent.create({
        Tenant: integration.Tenant,
        asaasEventId: dedupKey,
        event: body.event ?? 'unknown',
        payload: body,
        status: 'received',
        attempts: 1,
        receivedAt: new Date(),
      });
      createdEventId = createdEvent._id.toString();
    } catch (err) {
      // E11000: este asaasEventId já foi visto (qualquer status anterior) —
      // reentrega genuína, no-op (PAY-07). Reprocessar um evento 'failed' é
      // trabalho exclusivo do worker de reconciliação (T24), nunca deste
      // handler.
      if (!isDuplicateKeyError(err)) {
        console.error(
          JSON.stringify({
            event: 'asaas_webhook.processing_error',
            message: err instanceof Error ? err.message : String(err),
          }),
        );
      }
      res.status(200).json(respObj({}));
      return;
    }

    try {
      const chargeId = body.payment?.id;
      if (!chargeId) throw new Error('Webhook sem payment.id');

      const payment = await Payment.findOne(
        tenantScoped({ Tenant: integration.Tenant.toString(), asaasChargeId: chargeId }),
      ).lean();
      if (!payment) throw new Error('Payment não encontrado para este asaasChargeId');

      await applyAsaasPaymentStatus(
        integration.Tenant.toString(),
        payment._id.toString(),
        body.payment?.status ?? 'PENDING',
        body,
      );
      await AsaasEvent.updateOne({ _id: createdEventId }, { $set: { status: 'processed', processedAt: new Date() } });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await AsaasEvent.updateOne({ _id: createdEventId }, { $set: { status: 'failed', error: message } });
      console.error(JSON.stringify({ event: 'asaas_webhook.processing_error', message }));
    }

    res.status(200).json(respObj({}));
  };
};

export const createAsaasWebhookRouter = (): Router => {
  const router = Router();
  const rawBodyJson = express.json({
    verify: (req, _res, buf) => {
      (req as RawBodyRequest).rawBody = Buffer.from(buf);
    },
  });

  router.post('/:webhookToken', rawBodyJson, createAsaasWebhookAuthMiddleware(), handleIncoming());

  return router;
};
