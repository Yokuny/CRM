import { z } from 'zod';
import { idSchema } from './id.schema.js';

// spec.md Edge Cases: um campo de referência opcional (customer/process/
// order/assignee) enviado como string vazia é tratado como "sem referência",
// não como erro de validação — comum quando um <select> HTML fica sem
// seleção. `position` NÃO existe neste schema: é calculado pelo repository
// (sempre ao final da coluna) — o cliente nunca escolhe a posição na
// criação, só pelo moveCardSchema (T5, mover).
const optionalRefIdSchema = z
  .union([idSchema, z.literal('')])
  .optional()
  .transform((value) => (value === '' ? undefined : value));

// spec.md KAN-13/KAN-14/KAN-15: card é 100% livre — só `title` e `column`
// são obrigatórios; customer/process/order/assignee são independentes.
export const createCardSchema = z
  .object({
    column: idSchema,
    title: z.string().trim().min(1, 'title é obrigatório').max(120, 'title inválido'),
    description: z.string().trim().max(2000, 'description inválida').optional(),
    customer: optionalRefIdSchema,
    process: optionalRefIdSchema,
    order: optionalRefIdSchema,
    assignee: optionalRefIdSchema,
  })
  .strict();

export type CreateCard = z.infer<typeof createCardSchema>;
