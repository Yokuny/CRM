import { z } from 'zod';

// spec.md SCH-04: Space é informativo (não restringe disponibilidade) — só
// o nome é validado aqui.
export const createSpaceSchema = z
  .object({
    name: z.string().trim().min(1, 'name é obrigatório').max(200, 'name inválido'),
  })
  .strict();

export type CreateSpace = z.infer<typeof createSpaceSchema>;
