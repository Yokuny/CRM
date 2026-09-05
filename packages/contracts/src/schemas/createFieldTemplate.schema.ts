import { z } from 'zod';
import { fieldDefSchema, MAX_FIELDS_PER_TEMPLATE } from './fieldDef.schema.js';

export const FIELD_TEMPLATE_TARGET_TYPES = ['customer', 'process'] as const;

export type FieldTemplateTargetType = (typeof FIELD_TEMPLATE_TARGET_TYPES)[number];

// `key` é obrigatório para `process` (o tenant tem um template por tipo de
// processo: compra, agendamento...). Para `customer` o schema aceita a forma
// com ou sem `key` — a regra de negócio de forçar o `key` padrão é do service,
// não do contrato.
export const createFieldTemplateSchema = z
  .object({
    targetType: z.enum(FIELD_TEMPLATE_TARGET_TYPES),
    key: z.string().trim().min(1).max(60).optional(),
    name: z
      .string()
      .trim()
      .min(3, 'nome deve ter entre 3 e 120 caracteres')
      .max(120, 'nome deve ter entre 3 e 120 caracteres'),
    fields: z.array(fieldDefSchema).min(1).max(MAX_FIELDS_PER_TEMPLATE),
    stages: z.array(z.string().trim().min(1)).min(1).optional(),
  })
  .strict()
  .superRefine((body, ctx) => {
    if (body.targetType === 'process' && !body.key) {
      ctx.addIssue({ code: 'custom', path: ['key'], message: 'key é obrigatório para targetType process' });
    }
    // AD-023: `stages` é a fonte de verdade da guarda de transição de Process
    // (CORE-09/17) — obrigatório, não vazio e único só para targetType
    // process; customer nunca tem stage, então nem deve aceitar o campo.
    if (body.targetType === 'process') {
      if (!body.stages) {
        ctx.addIssue({ code: 'custom', path: ['stages'], message: 'stages é obrigatório para targetType process' });
      } else if (new Set(body.stages).size !== body.stages.length) {
        ctx.addIssue({ code: 'custom', path: ['stages'], message: 'stages não pode conter valores duplicados' });
      }
    }
    if (body.targetType === 'customer' && body.stages) {
      ctx.addIssue({ code: 'custom', path: ['stages'], message: 'stages não é permitido para targetType customer' });
    }
  });

export type CreateFieldTemplate = z.infer<typeof createFieldTemplateSchema>;
