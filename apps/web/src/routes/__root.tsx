import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';

// Contexto tipado com o queryClient — é o que o beforeLoad de _private.tsx
// (T30) usa para chamar ensureQueryData(sessionQuery). TanStack Query é dono
// da verdade da sessão; nenhum Zustand aqui (AD-014, Tech Decisions).
export type RouterContext = { queryClient: QueryClient };

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
});
