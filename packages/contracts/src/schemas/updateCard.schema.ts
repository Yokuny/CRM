import { z } from 'zod';
import { createCardSchema } from './createCard.schema.js';

// spec.md KAN-16: editar título/descrição/referências de um card NUNCA
// altera a coluna atual — `column` é omitido do tipo (garantia em nível de
// contrato, não só de service); `position` também nunca existiu em
// createCardSchema, então já está ausente aqui. Mover é sempre via
// moveCardSchema (T5), rota dedicada.
export const updateCardSchema = createCardSchema.omit({ column: true }).partial().strict();

export type UpdateCard = z.infer<typeof updateCardSchema>;
