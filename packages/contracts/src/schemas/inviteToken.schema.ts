import { z } from 'zod';

export const inviteTokenParamSchema = z
  .object({
    token: z.string().min(1, 'token inválido'),
  })
  .strict();
