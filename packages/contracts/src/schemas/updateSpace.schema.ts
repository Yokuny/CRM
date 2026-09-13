import { z } from 'zod';

// spec.md SCH-04: PATCH aceita name e/ou active, ambos opcionais.
export const updateSpaceSchema = z
  .object({
    name: z.string().trim().min(1, 'name é obrigatório').max(200, 'name inválido').optional(),
    active: z.boolean().optional(),
  })
  .strict();

export type UpdateSpace = z.infer<typeof updateSpaceSchema>;
