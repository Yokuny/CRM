import { z } from 'zod';

// Corpo de POST /conversations/:id/messages (AIG-36/37): duas formas
// mutuamente exclusivas — texto livre (só dentro da janela de 24h, checado no
// service) ou template aprovado (dentro ou fora da janela). Sem campo `type`
// artificial: a forma do corpo já discrimina a variante (nenhuma das duas é
// mencionada com um wrapper extra em spec.md/design.md), e `.strict()` em
// cada uma impede misturar as duas ou colar um campo de tenant.
const sendTextSchema = z
  .object({
    text: z.string().trim().min(1, 'text é obrigatório'),
  })
  .strict();

const sendTemplateSchema = z
  .object({
    templateName: z.string().trim().min(1, 'templateName é obrigatório'),
    templateLanguage: z.string().trim().min(1, 'templateLanguage é obrigatório'),
    templateParams: z.record(z.string(), z.string()),
  })
  .strict();

export const sendMessageSchema = z.union([sendTextSchema, sendTemplateSchema]);

export type SendMessage = z.infer<typeof sendMessageSchema>;
