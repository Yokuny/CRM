import type { Request } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { CustomError } from './errorHandler.middleware.js';

// Chave por e-mail normalizado + IP (síncrono — nossa versão não precisa do
// keyGenerator assíncrono da referência, que checava assinatura da clínica).
const emailAndIpKeyGenerator = (req: Request): string => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : 'sem-email';
  return `${email}:${ipKeyGenerator(req.ip ?? 'unknown')}`;
};

// Rotas autenticadas de mutação de template não têm e-mail no corpo — a chave
// é o par tenant+IP (FLD-16). Divergência consciente do gerador acima.
const tenantAndIpKeyGenerator = (req: Request): string => {
  const tenant = req.tenantUser?.tenant ?? 'sem-tenant';
  return `${tenant}:${ipKeyGenerator(req.ip ?? 'unknown')}`;
};

const rejectWithTooManyRequests = (message: string, keyGenerator = emailAndIpKeyGenerator) => {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator,
    handler: (_req, _res, next) => {
      next(new CustomError(message, 429));
    },
  });
};

// FND-14: só protege login e convite; ambos por e-mail normalizado + IP.
export const signinRateLimit = rejectWithTooManyRequests(
  'Muitas tentativas de login. Tente novamente em alguns minutos.',
);
export const inviteRateLimit = rejectWithTooManyRequests(
  'Muitos convites enviados. Tente novamente em alguns minutos.',
);

// FLD-16: mutação estrutural de template, por tenant + IP.
export const fieldTemplateRateLimit = rejectWithTooManyRequests(
  'Muitas alterações de template. Tente novamente em alguns minutos.',
  tenantAndIpKeyGenerator,
);
