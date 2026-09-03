import { QueryClient } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { Route as rootRoute } from './routes/__root.js';
import { Route as privateIndexRoute } from './routes/_private/index.js';
import { Route as privateLayoutRoute } from './routes/_private.js';
import { Route as authRoute } from './routes/_public/auth/index.js';
import { Route as inviteRoute } from './routes/_public/invite/index.js';

// TanStack Query é dono da verdade da sessão (AD-014) — o queryClient entra
// no contexto do router para que _private.tsx (beforeLoad) chame
// ensureQueryData(sessionQuery) sem precisar de Zustand.
export const queryClient = new QueryClient();

const routeTree = rootRoute.addChildren([authRoute, inviteRoute, privateLayoutRoute.addChildren([privateIndexRoute])]);

export const router = createRouter({ routeTree, context: { queryClient } });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
