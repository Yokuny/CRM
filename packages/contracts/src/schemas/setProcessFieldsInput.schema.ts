import { z } from 'zod';
import { idSchema } from './id.schema.js';

// Input da tool set_process_fields (Anel A, AIG-19): `values` é validado
// contra a templateVersion do PRÓPRIO Process (não a corrente do template) —
// essa validação profunda é runtime via field-engine, não estática aqui.
// `processId` precisa pertencer ao Tenant do ToolContext (runtime) —
// Tenant/channelId/conversationId nunca entram aqui (AD-010), `.strict()`
// garante.
export const setProcessFieldsInputSchema = z
  .object({
    processId: idSchema,
    values: z.record(z.string(), z.unknown()),
  })
  .strict();

export type SetProcessFieldsInput = z.infer<typeof setProcessFieldsInputSchema>;
