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
  })
  .strict()
  .superRefine((body, ctx) => {
    if (body.targetType === 'process' && !body.key) {
      ctx.addIssue({ code: 'custom', path: ['key'], message: 'key é obrigatório para targetType process' });
    }
  });

export type CreateFieldTemplate = z.infer<typeof createFieldTemplateSchema>;
