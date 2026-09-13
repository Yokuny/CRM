import { z } from 'zod';
import { idSchema } from './id.schema.js';

// spec.md KAN-09: reordena as colunas de um board — o array completo de
// columnIds, na nova ordem desejada.
export const reorderColumnsSchema = z
  .object({
    columnIds: z.array(idSchema).min(1, 'columnIds precisa de ao menos 1 item'),
  })
  .strict();

export type ReorderColumns = z.infer<typeof reorderColumnsSchema>;
