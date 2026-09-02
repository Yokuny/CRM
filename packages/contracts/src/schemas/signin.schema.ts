import { z } from 'zod';

export const signinSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('e-mail inválido'),
    password: z.string().min(1, 'senha é obrigatória'),
  })
  .strict();

export type SignIn = z.infer<typeof signinSchema>;
