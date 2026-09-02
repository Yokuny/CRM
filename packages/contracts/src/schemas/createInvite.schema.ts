import { z } from 'zod';

export const createInviteSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('e-mail inválido'),
    role: z.enum(['admin', 'gestor', 'operador']),
  })
  .strict();

export type CreateInvite = z.infer<typeof createInviteSchema>;
