import type { QueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { isAdminSession, sessionQuery } from '../../query/session.js';

// Layout pathless (não entra na URL) das telas só de admin — hoje só os campos
// personalizados. Mesma guarda binária de _private.tsx, um nível abaixo: a
// sessão já está no cache (ensureQueryData do pai), e quem não é admin volta
// pro início em vez de ver uma tela cujas ações o back-end recusaria (403).
export const beforeLoad = async ({ context }: { context: { queryClient: QueryClient } }): Promise<void> => {
  const session = await context.queryClient.ensureQueryData(sessionQuery);
  if (!isAdminSession(session)) throw redirect({ to: '/' });
};

export const Route = createFileRoute('/_private/_admin')({ beforeLoad });
