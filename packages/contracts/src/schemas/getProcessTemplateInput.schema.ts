import { z } from 'zod';

// Input da tool get_process_template (Anel A, AIG-15): só o `key` do template
// escolhido pelo modelo — o Tenant vem sempre do ToolContext do servidor
// (AD-010), nunca do input_schema. `.strict()` garante que nenhum campo de
// tenant/canal/conversa se cole aqui.
export const getProcessTemplateInputSchema = z
  .object({
    key: z.string().trim().min(1, 'key é obrigatório'),
  })
  .strict();

export type GetProcessTemplateInput = z.infer<typeof getProcessTemplateInputSchema>;
