import { z } from 'zod';

// Input da tool find_or_create_customer (Anel A, AIG-16): `phone` é a única
// chave obrigatória (é o que o WhatsApp sempre dá); `name`/`document` são
// opcionais para o caso de criação. Tenant vem do ToolContext (AD-010), nunca
// daqui — `.strict()` recusa qualquer campo extra.
export const findOrCreateCustomerInputSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    phone: z.string().trim().min(1, 'phone é obrigatório'),
    document: z.string().trim().min(1).optional(),
  })
  .strict();

export type FindOrCreateCustomerInput = z.infer<typeof findOrCreateCustomerInputSchema>;
