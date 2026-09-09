import { z } from 'zod';

// spec.md P1 "Cadastro de catálogo"/AC1/AC4: name obrigatório, price/stock
// inteiros >=0 (centavos), sku/description/active opcionais — `active`
// nasce `default:true` no Mongoose (product.model.ts), não duplicado aqui.
export const createProductSchema = z
  .object({
    name: z.string().trim().min(1, 'name é obrigatório').max(200, 'name inválido'),
    sku: z.string().trim().max(60, 'sku inválido').optional(),
    description: z.string().trim().max(2000, 'description inválida').optional(),
    price: z.number().int('price deve ser inteiro').min(0, 'price não pode ser negativo'),
    stock: z.number().int('stock deve ser inteiro').min(0, 'stock não pode ser negativo'),
    active: z.boolean().optional(),
  })
  .strict();

export type CreateProduct = z.infer<typeof createProductSchema>;
