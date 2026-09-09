import { z } from 'zod';

// spec.md P1 "Cadastro de catálogo"/AC3/AC4: PATCH /products/:id aceita
// qualquer subconjunto dos mesmos campos de createProductSchema — inclusive
// `stock`/`active` (AC3) — todos opcionais.
export const updateProductSchema = z
  .object({
    name: z.string().trim().min(1, 'name é obrigatório').max(200, 'name inválido').optional(),
    sku: z.string().trim().max(60, 'sku inválido').optional(),
    description: z.string().trim().max(2000, 'description inválida').optional(),
    price: z.number().int('price deve ser inteiro').min(0, 'price não pode ser negativo').optional(),
    stock: z.number().int('stock deve ser inteiro').min(0, 'stock não pode ser negativo').optional(),
    active: z.boolean().optional(),
  })
  .strict();

export type UpdateProduct = z.infer<typeof updateProductSchema>;
