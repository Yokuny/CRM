import crypto from 'node:crypto';
import type { CreateAsaasIntegration } from '@crm/contracts';
import type { AsaasEnvironment } from '@crm/db';
import { decrypt, encrypt, maskSecret, sha256 } from '@crm/db';
import { env } from '../config/env.config.js';
import { CustomError } from '../middlewares/errorHandler.middleware.js';
import * as asaasClient from '../providers/asaasClient.js';
import type { AsaasIntegrationRecord } from '../repositories/asaasIntegration.repository.js';
import * as asaasIntegrationRepository from '../repositories/asaasIntegration.repository.js';

export type AsaasIntegrationPublicRecord = {
  id: string;
  tenant: string;
  apiKey: string; // sempre mascarado (maskSecret) — nunca em claro
  environment: AsaasEnvironment;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
};

const WEBHOOK_TOKEN_BYTES = 24;
const AUTH_TOKEN_BYTES = 24;

// Prefixo confirmado via docs.asaas.com (design.md Research Provenance):
// `$aact_prod_...` = produção; qualquer outra coisa (inclui `$aact_hmlg_...`)
// = sandbox. Nunca um campo de formulário (spec.md, Assumptions).
const PRODUCTION_KEY_PREFIX = '$aact_prod_';

const detectEnvironment = (apiKey: string): AsaasEnvironment =>
  apiKey.startsWith(PRODUCTION_KEY_PREFIX) ? 'production' : 'sandbox';

// A chave nunca sai em claro da camada de serviço (mesma garantia de
// channel.service.ts/AIG-01, aqui para spec.md P1 AC3) — decifra só para
// mascarar (últimos 4 caracteres), nunca devolve `apiKeyEnc` bruto.
const toPublicRecord = (integration: AsaasIntegrationRecord): AsaasIntegrationPublicRecord => ({
  id: integration.id,
  tenant: integration.tenant,
  apiKey: maskSecret(decrypt(integration.apiKeyEnc, env.ASAAS_ENC_KEY)),
  environment: integration.environment,
  status: integration.status,
  createdAt: integration.createdAt,
  updatedAt: integration.updatedAt,
});

// spec.md P1 "Tenant configura sua própria chave Asaas": valida a chave
// AO VIVO contra o Asaas ANTES de qualquer persistência (AC1/AC2) — uma
// chave rejeitada (401) não grava nada, nem chama o registro de webhook.
// Ordem: detecta o ambiente do prefixo (precisa dele para validar) → valida
// ao vivo → gera webhookToken/authToken → auto-registra o webhook →
// criptografa a chave → persiste (nunca o authToken em claro, só seu hash).
export const createIntegration = async (
  tenantId: string,
  data: CreateAsaasIntegration,
): Promise<AsaasIntegrationPublicRecord> => {
  const environment = detectEnvironment(data.apiKey);

  const isValid = await asaasClient.validateApiKey(data.apiKey, environment);
  if (!isValid) throw new CustomError('Chave Asaas inválida ou revogada', 422);

  const webhookToken = crypto.randomBytes(WEBHOOK_TOKEN_BYTES).toString('hex');
  const authToken = crypto.randomBytes(AUTH_TOKEN_BYTES).toString('hex');
  const webhookUrl = `${env.ASAAS_WEBHOOK_BASE_URL}/webhooks/asaas/${webhookToken}`;
  const { asaasWebhookId } = await asaasClient.registerWebhook(data.apiKey, environment, webhookUrl, authToken);

  const apiKeyEnc = encrypt(data.apiKey, env.ASAAS_ENC_KEY);
  const integration = await asaasIntegrationRepository.createIntegration(tenantId, {
    apiKeyEnc,
    environment,
    webhookToken,
    webhookAuthTokenHash: sha256(authToken),
    asaasWebhookId,
  });
  return toPublicRecord(integration);
};

// AD-010: findByTenant já é tenant-scoped — mesmo idioma 404 de
// channel.service.ts.getCurrentChannel.
export const getCurrentIntegration = async (tenantId: string): Promise<AsaasIntegrationPublicRecord> => {
  const integration = await asaasIntegrationRepository.findByTenant(tenantId);
  if (!integration) throw new CustomError('Integração Asaas não encontrada', 404);
  return toPublicRecord(integration);
};
