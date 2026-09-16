import { TanStackDevtools } from '@tanstack/react-devtools';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools';
import { RouterProvider } from '@tanstack/react-router';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from './components/ui/sonner.js';
import './index.css';
import { queryClient, router } from './router.js';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Elemento #root não encontrado.');

// Toaster montado uma única vez na raiz (T11) — toast() de qualquer tela
// (ex.: erro do kanban, WEB-03) renderiza aqui, fora da árvore de rotas.
// TanStackDevtools (idem, montado uma única vez): removeDevtoolsOnBuild do
// plugin @tanstack/devtools-vite (vite.config.ts) já tira isto do bundle de
// produção sozinho, sem guard de import.meta.env.DEV aqui.
createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster />
      <TanStackDevtools
        config={{ hideUntilHover: true }}
        plugins={[
          { name: 'TanStack Query', render: <ReactQueryDevtoolsPanel /> },
          { name: 'TanStack Router', render: <TanStackRouterDevtoolsPanel router={router} /> },
        ]}
      />
    </QueryClientProvider>
  </StrictMode>,
);
