import { z } from 'zod';

// spec.md KAN-04: editar nome/descrição de um board — colunas mudam pelas
// rotas de coluna (createColumn/updateColumn/reorderColumns, T4), não aqui.
export const updateBoardSchema = z
  .object({
    name: z.string().trim().min(3, 'name inválido').max(80, 'name inválido').optional(),
    description: z.string().trim().max(500, 'description inválida').optional(),
  })
  .strict();

export type UpdateBoard = z.infer<typeof updateBoardSchema>;
