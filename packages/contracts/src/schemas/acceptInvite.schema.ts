import { z } from 'zod';

export const acceptInviteSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(3, 'nome deve ter entre 3 e 80 caracteres')
      .max(80, 'nome deve ter entre 3 e 80 caracteres'),
    password: z.string().min(8, 'senha deve ter no mínimo 8 caracteres'),
  })
  .strict();

export type AcceptInvite = z.infer<typeof acceptInviteSchema>;
