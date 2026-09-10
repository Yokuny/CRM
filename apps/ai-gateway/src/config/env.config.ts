import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI é obrigatória'),
  AI_GATEWAY_PORT: z.string().min(1, 'AI_GATEWAY_PORT é obrigatória'),
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY é obrigatória'),
  META_APP_SECRET: z.string().min(1, 'META_APP_SECRET é obrigatória'),
  META_WEBHOOK_VERIFY_TOKEN: z.string().min(1, 'META_WEBHOOK_VERIFY_TOKEN é obrigatória'),
  CHANNEL_ENC_KEY: z.string().min(1, 'CHANNEL_ENC_KEY é obrigatória'),
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY é obrigatória'),
  // AD-012/AD-034 (payments-asaas): mesma chave que apps/crm-api usa para
  // criptografar a apiKey do tenant (asaasIntegration.service.ts) —
  // ai-gateway a usa para decifrar ao chamar o Asaas (providers/asaasClient.ts,
  // T15). Mesmo padrão de CHANNEL_ENC_KEY acima.
  ASAAS_ENC_KEY: z.string().min(1, 'ASAAS_ENC_KEY é obrigatória'),
});

export type Env = z.infer<typeof envSchema>;

// safeParse (não parse): controla a mensagem de falha para NOMEAR a variável
// ausente, em vez de expor o erro cru do Zod (FND-18) — mesmo padrão de
// apps/crm-api/src/config/env.config.ts.
export const parseEnv = (source: NodeJS.ProcessEnv): Env => {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const missing = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Variável(is) de ambiente ausente(s) ou inválida(s): ${missing}`);
  }
  return result.data;
};

// Validado no import do módulo — falha aqui derruba o boot antes de qualquer
// tráfego ser aceito (FND-18).
export const env = parseEnv(process.env);
