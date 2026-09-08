import { idSchema } from '@crm/contracts';
import { z } from 'zod';

// AD-030: `search: { id }`, nunca um `$id` path segment. Diferente de
// customers/details.tsx (que usa `z.string().min(1)`), tasks.md (T21) pede
// explicitamente `idSchema` aqui — mesmo schema hexadecimal de 24 chars já
// usado pelos params `:id` do próprio `conversation.router.ts` no back-end.
// `.optional()`: ausência de `id` é um estado válido (nenhuma thread aberta,
// design.md Componente 6), não um erro de validação.
export const inboxSearchSchema = z.object({ id: idSchema.optional() }).strict();
export type InboxSearch = z.infer<typeof inboxSearchSchema>;
