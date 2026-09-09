import { z } from 'zod';

// Corpo de POST /asaas-integrations (spec.md P1 "Tenant configura sua
// própria chave Asaas" AC1/AC2): só a apiKey em texto puro — environment é
// SEMPRE auto-detectado do prefixo da própria chave (design.md, nunca um
// campo de formulário). Regex confirma o formato real de chave do Asaas
// (design.md Research Provenance, docs.asaas.com/docs/chaves-de-api):
// `$aact_prod_...` (produção) ou `$aact_hmlg_...` (sandbox). Tenant vem
// sempre da sessão (AD-010) — nunca do corpo, mesmo padrão .strict() de
// createChannelSchema.
export const createAsaasIntegrationSchema = z
  .object({
    apiKey: z
      .string()
      .trim()
      .regex(/^\$aact_(prod|hmlg)_[A-Za-z0-9+/=_:-]{10,}$/, 'apiKey não corresponde ao formato de chave Asaas'),
  })
  .strict();

export type CreateAsaasIntegration = z.infer<typeof createAsaasIntegrationSchema>;
