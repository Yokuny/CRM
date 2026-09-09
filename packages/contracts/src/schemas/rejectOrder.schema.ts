import { z } from 'zod';

// spec.md P1 "Operador aprova ou rejeita um pedido pendente"/AC6:
// POST /orders/:id/reject aceita um `reason` opcional.
export const rejectOrderSchema = z
  .object({
    reason: z.string().trim().max(500, 'reason inválido').optional(),
  })
  .strict();

export type RejectOrder = z.infer<typeof rejectOrderSchema>;
