import { z } from 'zod';

// Corpo de POST /channels (AIG-01/03): phoneNumberId + accessToken são os dois
// campos que o admin informa; wabaId/displayPhoneNumber são metadados
// opcionais da Meta. Tenant vem sempre da sessão (AD-010) — nunca do corpo,
// mesmo padrão .strict() de createCustomerSchema.
export const createChannelSchema = z
  .object({
    phoneNumberId: z.string().trim().min(1, 'phoneNumberId é obrigatório'),
    wabaId: z.string().trim().min(1).optional(),
    displayPhoneNumber: z.string().trim().min(1).optional(),
    accessToken: z.string().trim().min(1, 'accessToken é obrigatório'),
  })
  .strict();

export type CreateChannel = z.infer<typeof createChannelSchema>;
