import type { QueryClient } from '@tanstack/react-query';
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { sessionQuery } from '../query/session.js';

// Tech Decisions (design.md): beforeLoad + ensureQueryData(GET /auth/session),
// NUNCA Zustand — evita a segunda fonte de verdade que causaria o loop de
// redirecionamento que FND-10/AC3 proíbe. sessionQuery tem retry:false, então
// uma sessão inválida falha na primeira tentativa e redireciona uma única vez
// por navegação — nunca re-tenta e nunca acumula redirects.
export const beforeLoad = async ({ context }: { context: { queryClient: QueryClient } }): Promise<void> => {
  try {
    await context.queryClient.ensureQueryData(sessionQuery);
  } catch {
    throw redirect({ to: '/auth' });
  }
};

export const Route = createFileRoute('/_private')({
  beforeLoad,
  component: () => <Outlet />,
});
