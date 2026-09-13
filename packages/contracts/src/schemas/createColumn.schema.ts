import { z } from 'zod';

// spec.md KAN-07/KAN-29: nova coluna vai ao final da ordem atual (o
// `order` numérico é calculado pelo repository, não recebido do cliente).
export const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'color inválida (#RRGGBB)');

export const createColumnSchema = z
  .object({
    label: z.string().trim().min(1, 'label é obrigatório').max(60, 'label inválido'),
    color: hexColorSchema.optional(),
  })
  .strict();

export type CreateColumn = z.infer<typeof createColumnSchema>;
