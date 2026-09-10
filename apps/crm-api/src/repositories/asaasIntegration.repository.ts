import type { EncryptedSecret } from '@crm/db';
import { AsaasIntegration, type AsaasIntegrationDocument, tenantScoped } from '@crm/db';
import { withDbTiming } from '../metrics/db.metric.js';

export type AsaasIntegrationRecord = {
  id: string;
  tenant: string;
  apiKeyEnc: EncryptedSecret;
  environment: 'sandbox' | 'production';
  webhookToken: string;
  webhookAuthTokenHash: string;
  asaasWebhookId?: string;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
};

const toRecord = (doc: AsaasIntegrationDocument): AsaasIntegrationRecord => ({
  id: doc._id.toString(),
  tenant: doc.Tenant.toString(),
  apiKeyEnc: doc.apiKeyEnc,
  environment: doc.environment,
  webhookToken: doc.webhookToken,
  webhookAuthTokenHash: doc.webhookAuthTokenHash,
  asaasWebhookId: doc.asaasWebhookId,
  status: doc.status,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

export type CreateAsaasIntegrationData = {
  apiKeyEnc: EncryptedSecret;
  environment: 'sandbox' | 'production';
  webhookToken: string;
  webhookAuthTokenHash: string;
  asaasWebhookId?: string;
};

// `tenantId` é parâmetro próprio (nunca lido de `data`) — cada campo de
// `data` é copiado individualmente para `AsaasIntegration.create` (nunca um
// spread `...data`), mesmo idioma de channel.repository.ts.createChannel
// (AIG-03).
export const createIntegration = async (
  tenantId: string,
  data: CreateAsaasIntegrationData,
): Promise<AsaasIntegrationRecord> =>
  withDbTiming('asaasIntegration.createIntegration', async () => {
    const doc = await AsaasIntegration.create({
      Tenant: tenantId,
      apiKeyEnc: data.apiKeyEnc,
      environment: data.environment,
      webhookToken: data.webhookToken,
      webhookAuthTokenHash: data.webhookAuthTokenHash,
      asaasWebhookId: data.asaasWebhookId,
    });
    return toRecord(doc);
  });

// Tenant-scoped (AD-010): v1 é uma AsaasIntegration por Tenant (índice único
// {Tenant:1}, design.md), então devolve no máximo um documento.
export const findByTenant = async (tenantId: string): Promise<AsaasIntegrationRecord | null> =>
  withDbTiming('asaasIntegration.findByTenant', async () => {
    const doc = await AsaasIntegration.findOne(tenantScoped({ Tenant: tenantId })).lean();
    return doc ? toRecord(doc) : null;
  });

// Sem filtro de Tenant DE PROPÓSITO (AD-010, exceção documentada, mesmo
// idioma de channel.repository.ts.findByPhoneNumberId): é o próprio
// resolvedor de tenant do webhook do Asaas — o Tenant é desconhecido até
// este lookup resolver o `webhookToken` do path param.
export const findByWebhookToken = async (webhookToken: string): Promise<AsaasIntegrationRecord | null> =>
  withDbTiming('asaasIntegration.findByWebhookToken', async () => {
    const doc = await AsaasIntegration.findOne({ webhookToken }).lean();
    return doc ? toRecord(doc) : null;
  });
