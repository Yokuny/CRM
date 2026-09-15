import { z } from 'zod';

// spec.md KAN-01/KAN-02: board precisa de nome e ao menos 1 coluna inicial.
// Mesmo formato de coluna que createColumnSchema (T4) usa isoladamente,
// duplicado aqui de propósito: T3 roda antes de T4 na ordem sequencial da
// Fase 1 (tasks.md), então este arquivo não pode depender de um arquivo que
// ainda não existe.
const initialColumnSchema = z
  .object({
    label: z.string().trim().min(1, 'label é obrigatório').max(60, 'label inválido'),
    color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/, 'color inválida (#RRGGBB)')
      .optional(),
  })
  .strict();

export const createBoardSchema = z
  .object({
    name: z.string().trim().min(3, 'name inválido').max(80, 'name inválido'),
    description: z.string().trim().max(500, 'description inválida').optional(),
    columns: z.array(initialColumnSchema).min(1, 'board precisa de ao menos 1 coluna'),
  })
  .strict();

export type CreateBoard = z.infer<typeof createBoardSchema>;
