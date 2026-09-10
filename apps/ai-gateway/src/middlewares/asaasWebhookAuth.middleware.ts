import { badRespObj } from '@crm/contracts';
import { AsaasIntegration, type AsaasIntegrationDocument, sha256 } from '@crm/db';
import type { NextFunction, Request, Response } from 'express';

// design.md Components "asaasWebhook.router.ts + asaasWebhookAuth.middleware.ts":
// resolve o tenant pelo `:webhookToken` opaco da URL — NÃO tenant-scoped por
// definição (a própria resolução do token É o que descobre de qual tenant se
// trata), mesma exceção legítima ao AD-010 que o webhook da Meta já usa para
// resolver Channel por phoneNumberId sem filtro de tenant.
export type AsaasWebhookRequest = Request & { asaasIntegration?: AsaasIntegrationDocument };

// 401 sem tocar nenhum dado (PAY-06) — middleware isolado, testável como
// função pura via req/res mockados (mesmo padrão de webhookSignature.middleware.ts).
// Mecanismo de verificação do Asaas (token opaco na URL + header hasheado
// comparado) é diferente do HMAC-do-corpo da Meta por natureza do provedor,
// não por escolha (design.md Tech Decisions).
export const createAsaasWebhookAuthMiddleware = () => {
  return async (req: AsaasWebhookRequest, res: Response, next: NextFunction): Promise<void> => {
    const integration = await AsaasIntegration.findOne({ webhookToken: req.params.webhookToken }).lean();
    if (!integration) {
      res.status(401).json(badRespObj({ message: 'Token de webhook Asaas desconhecido' }));
      return;
    }

    const header = req.header('asaas-access-token');
    if (!header || sha256(header) !== integration.webhookAuthTokenHash) {
      res.status(401).json(badRespObj({ message: 'Header asaas-access-token ausente ou inválido' }));
      return;
    }

    req.asaasIntegration = integration;
    next();
  };
};
