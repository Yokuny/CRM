import { z } from 'zod';

// WEB-09: persiste busca/ordenação/página/status na URL. Todos os campos
// têm `.default(...)`, então uma URL sem nenhum search param (`/customers`)
// já resolve para a mesma primeira página/ordenação que o usuário vê depois
// de qualquer navegação — restaura sozinho ao recarregar (F5).
export const customersSearchSchema = z.object({
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).optional().default(20),
  q: z.string().optional().default(''),
  sort: z.enum(['name', 'createdAt']).optional().default('createdAt'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
  status: z.string().optional(),
});

export type CustomersSearch = z.infer<typeof customersSearchSchema>;
