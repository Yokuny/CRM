import type { AsaasEnvironment, EncryptedSecret } from '@crm/db';

// Tipo apenas — a implementação REAL fica em apps/ai-gateway/src/providers/asaasClient.ts
// (T15), injetada via ToolContext (toolContext.ts, T16) → runTurn (T17), mesmo molde de
// AnthropicClient/WhisperClient/DownloadAudio (design.md Components "AsaasClient
// (ai-gateway)"). `apiKeyEnc` reusa o tipo `EncryptedSecret` já exportado por `@crm/db`
// (crypto.helper.ts) em vez de redeclarar a mesma forma — mesmos 3 campos de
// `AsaasIntegration.apiKeyEnc`.
export type AsaasIntegrationRef = {
  apiKeyEnc: EncryptedSecret;
  environment: AsaasEnvironment;
};

// `value`/o valor de cobrança devolvido são SEMPRE centavos (convenção de domínio
// deste codebase — Order.totalPrice, Product.price) — a conversão pra reais (formato
// que a API do Asaas exige) acontece só dentro da implementação real do ai-gateway
// (T15), nunca aqui nem em quem chama.
export type AsaasClient = {
  ensureCustomer: (
    integration: AsaasIntegrationRef,
    customer: { name: string; phone: string; document?: string },
  ) => Promise<{ asaasCustomerId: string }>;
  createPixCharge: (
    integration: AsaasIntegrationRef,
    params: { asaasCustomerId: string; value: number; description: string; dueDate: string },
  ) => Promise<{
    asaasChargeId: string;
    pixPayload?: string;
    pixEncodedImage?: string;
    pixExpirationDate?: Date;
  }>;
  getCharge: (integration: AsaasIntegrationRef, asaasChargeId: string) => Promise<{ asaasStatus: string }>;
};
