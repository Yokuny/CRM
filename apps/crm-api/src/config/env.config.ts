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
