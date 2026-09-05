import { z } from 'zod';

// Endpoint único de mutação de Customer (design.md): aceita qualquer
// subconjunto não vazio de core (`name`/`phone`/`document`) e/ou `values`
// parcial — o mesmo corpo serve tanto o drag do kanban (só `values.status`)
// quanto o formulário de edição completo (core+values), nunca dois endpoints
// separados (spec.md Assumptions).
export const updateCustomerSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    phone: z.string().trim().min(1).max(30).optional(),
    document: z.string().trim().min(1).optional(),
    values: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'nenhum campo para atualizar' });

export type UpdateCustomer = z.infer<typeof updateCustomerSchema>;
