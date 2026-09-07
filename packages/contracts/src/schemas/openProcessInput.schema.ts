import { z } from 'zod';
import { idSchema } from './id.schema.js';

// Input da tool open_process (Anel A, AIG-17/18): `customerId` precisa
// pertencer ao MESMO Tenant do ToolContext — essa verificação é runtime
// (mesma garantia CORE-10), não estática aqui. `values` é opcional (defaults
// aplicados pelo executor) — Tenant/channelId/conversationId nunca entram
// aqui (AD-010), `.strict()` garante.
export const openProcessInputSchema = z
  .object({
    templateKey: z.string().trim().min(1, 'templateKey é obrigatório'),
    customerId: idSchema,
    values: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type OpenProcessInput = z.infer<typeof openProcessInputSchema>;
