import { z } from 'zod';
import { idSchema } from './id.schema.js';

// spec.md KAN-18/KAN-19/KAN-21: arrastar um card entre colunas (ou reordenar
// dentro da mesma coluna) — o backend valida `column` contra board.columns
// independente de qualquer validação client-side (card.service.ts, T9).
export const moveCardSchema = z
  .object({
    column: idSchema,
    position: z.number().int('position deve ser inteiro').min(0, 'position inválido'),
  })
  .strict();

export type MoveCard = z.infer<typeof moveCardSchema>;
