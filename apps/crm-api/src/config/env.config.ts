import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI é obrigatória'),
  CRM_API_PORT: z.string().min(1, 'CRM_API_PORT é obrigatória'),
  SESSION_JWT_SECRET: z.string().min(1, 'SESSION_JWT_SECRET é obrigatória'),
  CORS_ORIGIN: z.string().min(1, 'CORS_ORIGIN é obrigatória'),
  MAIL_PROVIDER: z.enum(['log', 'nodemailer']).default('log'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  // Compartilhada com apps/ai-gateway/src/config/env.config.ts (AD-018, mesmo
  // .env único na raiz) — channel.service.ts (T34) criptografa/mascara o
  // accessToken do Channel com a MESMA chave que o outbox consumer do
  // ai-gateway usa para decifrar e enviar (packages/db/src/crypto.helper.ts).
  CHANNEL_ENC_KEY: z.string().min(1, 'CHANNEL_ENC_KEY é obrigatória'),
  // AD-012/AD-034 (payments-asaas): asaasIntegration.service.ts criptografa a
  // apiKey do tenant com a MESMA chave que apps/ai-gateway usa para decifrar
  // ao chamar o Asaas (packages/db/src/crypto.helper.ts) — mesmo padrão de
  // CHANNEL_ENC_KEY acima.
  ASAAS_ENC_KEY: z.string().min(1, 'ASAAS_ENC_KEY é obrigatória'),
  // Base URL pública usada para montar a URL do webhook por tenant
  // registrado no Asaas (`${ASAAS_WEBHOOK_BASE_URL}/webhooks/asaas/:webhookToken`)
  // — o Asaas chama essa URL a partir de fora, então precisa ser a URL
  // pública do apps/ai-gateway (onde o webhook é recebido), nunca localhost
  // em produção.
  ASAAS_WEBHOOK_BASE_URL: z.string().min(1, 'ASAAS_WEBHOOK_BASE_URL é obrigatória'),
  // Origem pública de apps/web (SCH-21/SCH-37) — usada para montar a URL da
  // página pública de confirmação (`${WEB_BASE_URL}/appointment?token=...`)
  // devolvida pela IA (book_appointment) e pelo botão "Pedir confirmação" do
  // operador (appointment.service.ts, requestConfirmationLink). Mesmo padrão
  // de ASAAS_WEBHOOK_BASE_URL acima, mas apontando para o front, não para o
  // ai-gateway.
  WEB_BASE_URL: z.string().min(1, 'WEB_BASE_URL é obrigatória'),
});

export type Env = z.infer<typeof envSchema>;

// safeParse (não parse): controla a mensagem de falha para NOMEAR a variável
// ausente, em vez de expor o erro cru do Zod (FND-18).
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
