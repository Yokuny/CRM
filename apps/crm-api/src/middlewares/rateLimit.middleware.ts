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

// O cliente sempre recebe a mesma chave (`too_many_attempts`); `scope` só
// identifica o limitador no log do errorHandler.
const rejectWithTooManyRequests = (scope: string, keyGenerator = emailAndIpKeyGenerator) => {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator,
    handler: (_req, _res, next) => {
      next(new CustomError('too_many_attempts', 429, scope));
    },
  });
};

// FND-14: só protege login e convite; ambos por e-mail normalizado + IP.
export const signinRateLimit = rejectWithTooManyRequests('signin');
export const inviteRateLimit = rejectWithTooManyRequests('invite');

// Rota pública de confirmação de agendamento (SCH-27): anônima, identificada
// só pelo token na URL — sem e-mail nem tenant na requisição, diferença
// consciente dos dois geradores acima. Só o IP.
const ipOnlyKeyGenerator = (req: Request): string => ipKeyGenerator(req.ip ?? 'unknown');

// FLD-16: mutação estrutural de template, por tenant + IP.
export const fieldTemplateRateLimit = rejectWithTooManyRequests('field_template', tenantAndIpKeyGenerator);

// CORE-14: mutação de Customer, por tenant + IP — mesmo molde de fieldTemplateRateLimit.
export const customerRateLimit = rejectWithTooManyRequests('customer', tenantAndIpKeyGenerator);

// CORE-14: mutação de Process, por tenant + IP — mesmo molde de customerRateLimit.
export const processRateLimit = rejectWithTooManyRequests('process', tenantAndIpKeyGenerator);

// spec.md Assumptions ("Rate limit da rota pública de confirmação"): a rota
// é anônima e recebe token na URL — sem limite, vira alvo de varredura
// (SCH-27).
export const appointmentConfirmationRateLimit = rejectWithTooManyRequests(
  'appointment_confirmation',
  ipOnlyKeyGenerator,
);
