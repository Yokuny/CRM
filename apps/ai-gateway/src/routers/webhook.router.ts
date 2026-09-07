import type { AnthropicClient } from '@crm/ai-kit';
import { runTurn } from '@crm/ai-kit';
import type { MessageType } from '@crm/db';
import { badRespObj, respObj } from '@crm/contracts';
import express, { type Request, type Response, Router } from 'express';
import { createWebhookSignatureMiddleware, type RawBodyRequest } from '../middlewares/webhookSignature.middleware.js';

export type WebhookRouterDeps = {
  client: AnthropicClient;
  verifyToken: string;
  appSecret: string;
};

// Shapes mínimas do payload da Meta necessárias para extrair 1 mensagem por
// vez (design.md mermaid: "webhook handler") — sem schema Zod aqui: o corpo
// vem de FORA da plataforma (Meta), dedup/validação de negócio já ficam nas
// etapas de ai-kit.runTurn/ingest (T18/T24), não no parsing do transporte.
type MetaIncomingMessage = {
  id?: string;
  from?: string;
  type?: string;
  text?: { body?: string };
  audio?: { id?: string };
  image?: { id?: string };
  document?: { id?: string };
};

type MetaWebhookBody = {
  entry?: {
    changes?: {
      value?: {
        metadata?: { phone_number_id?: string };
        messages?: MetaIncomingMessage[];
      };
    }[];
  }[];
};

// Tipos suportados nesta rodada (P1 = texto; P2/T45-47 liga áudio) — os
// demais (image/document/location/figurinha/vídeo) sempre viram
// 'unsupported' aqui; guardInput (T19) decide o fallback fixo.
const mapMessageType = (type: string | undefined): MessageType => {
  if (type === 'text' || type === 'audio' || type === 'image' || type === 'document' || type === 'location') {
    return type;
  }
  return 'unsupported';
};

const extractMediaId = (message: MetaIncomingMessage): string | undefined =>
  message.audio?.id ?? message.image?.id ?? message.document?.id;

// AIG-05: GET handshake — hub.challenge cru no corpo (sem envelope JSON), só
// quando hub.verify_token bate com o secret de plataforma.
const handleVerify = (verifyToken: string) => {
  return (req: Request, res: Response): void => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === verifyToken) {
      res.status(200).type('text/plain').send(typeof challenge === 'string' ? challenge : '');
      return;
    }

    res.status(403).json(badRespObj({ message: 'hub.verify_token inválido' }));
  };
};

// AIG-07/08: modelo síncrono (design.md Architecture Overview) — o pipeline
// inteiro (ai-kit.runTurn) roda DENTRO do handler antes de responder; erro
// interno é capturado aqui e ainda responde 200 — sem processamento em
// background, sem janela de perda por crash pós-ack.
const handleIncoming = (deps: WebhookRouterDeps) => {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body as MetaWebhookBody;
      const entries = Array.isArray(body?.entry) ? body.entry : [];

      for (const entry of entries) {
        const changes = Array.isArray(entry?.changes) ? entry.changes : [];
        for (const change of changes) {
          const phoneNumberId = change?.value?.metadata?.phone_number_id;
          const messages = Array.isArray(change?.value?.messages) ? change.value.messages : [];
          if (!phoneNumberId) continue; // payload malformado — ack sem processar (AIG edge case)

          for (const message of messages) {
            if (!message?.id || !message?.from) continue; // falta wamid/from — malformado, ack sem processar

            await runTurn(deps.client, {
              phoneNumberId,
              wamid: message.id,
              from: message.from,
              type: mapMessageType(message.type),
              text: message.text?.body,
              mediaId: extractMediaId(message),
            });
          }
        }
      }
    } catch (err) {
      // phone_number_id sem Channel/erro interno: runTurn/ingest já tratam
      // isso sem lançar (not_resolved/fallback) — este catch é uma rede de
      // segurança extra para qualquer falha inesperada no parsing acima,
      // nunca deixando o webhook responder algo != 200 (design.md Error
      // Handling Strategy).
      console.error(
        JSON.stringify({ event: 'webhook.processing_error', message: err instanceof Error ? err.message : String(err) }),
      );
    }

    res.status(200).json(respObj({}));
  };
};

export const createWebhookRouter = (deps: WebhookRouterDeps): Router => {
  const router = Router();
  const rawBodyJson = express.json({
    verify: (req, _res, buf) => {
      (req as RawBodyRequest).rawBody = Buffer.from(buf);
    },
  });

  router.get('/', handleVerify(deps.verifyToken));
  router.post('/', rawBodyJson, createWebhookSignatureMiddleware(deps.appSecret), handleIncoming(deps));

  return router;
};
