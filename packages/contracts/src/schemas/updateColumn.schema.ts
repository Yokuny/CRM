import { z } from 'zod';
import { hexColorSchema } from './createColumn.schema.js';

// spec.md KAN-08: renomear uma coluna (e/ou definir cor, KAN-29) sem mover
// os cards já associados a ela — ambos os campos opcionais e independentes.
export const updateColumnSchema = z
  .object({
    label: z.string().trim().min(1, 'label é obrigatório').max(60, 'label inválido').optional(),
    color: hexColorSchema.optional(),
  })
  .strict();

export type UpdateColumn = z.infer<typeof updateColumnSchema>;
