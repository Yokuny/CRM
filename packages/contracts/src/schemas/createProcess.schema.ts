import { z } from 'zod';
import { idSchema } from './id.schema.js';

// `templateKey` é o `key` do ProcessTemplate escolhido dentro do Tenant (mesmo
// conceito de `key` já usado em field-template); `customerId` referencia um
// Customer que precisa pertencer ao MESMO Tenant — essa verificação é runtime
// (CORE-10), não estática aqui. `values` é opcional (defaults aplicados pelo
// service, CORE-07) e validado a fundo pelo field-engine, não aqui.
export const createProcessSchema = z
  .object({
    templateKey: z.string().trim().min(1, 'templateKey é obrigatório').max(60, 'templateKey inválido'),
    customerId: idSchema,
    values: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type CreateProcess = z.infer<typeof createProcessSchema>;
