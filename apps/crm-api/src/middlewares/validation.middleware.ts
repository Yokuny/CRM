import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

type ValidationTarget = 'body' | 'params' | 'query';

// safeParse (nunca parse/try-catch): elimina de raiz o bug da referência —
// `next()` chamado dentro de um `for` sobre os erros (Risk: ERR_HTTP_HEADERS_SENT
// com múltiplos campos inválidos). Aqui só existe UM caminho de saída por
// chamada, e a leitura é sempre `error.issues` (Zod 4), nunca `error.errors`.
const validate = (schema: ZodType, target: ValidationTarget) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      const message = result.error.issues
        .map((issue) => `${issue.path.join('.') || target}: ${issue.message}`)
        .join('; ');
      next(Object.assign(new Error(message), { status: 400 }));
      return;
    }

    // Mutação in-place (não reatribuição): em Express 5, req.query pode ser
    // um getter — Object.assign preserva a referência e ainda aplica as
    // transformações do schema (ex.: e-mail em minúsculas).
    Object.assign(req[target] as object, result.data);
    next();
  };
};

export const validBody = (schema: ZodType) => validate(schema, 'body');
export const validParams = (schema: ZodType) => validate(schema, 'params');
export const validQuery = (schema: ZodType) => validate(schema, 'query');
