import { QueryClient } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen.js';

// TanStack Query é dono da verdade da sessão (AD-014) — o queryClient entra
// no contexto do router para que _private.tsx (beforeLoad) chame
// ensureQueryData(sessionQuery) sem precisar de Zustand.
export const queryClient = new QueryClient();

// AD-030: routeTree gerado por @tanstack/router-plugin (createFileRoute em
// cada arquivo de rota) — nenhuma composição manual de addChildren aqui.
export const router = createRouter({ routeTree, context: { queryClient } });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
