import { TanStackDevtools } from '@tanstack/react-devtools';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools';
import { RouterProvider } from '@tanstack/react-router';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from './components/ui/sonner.js';
// Karla (prosa: mensagens do WhatsApp, descrições, empty states) e IBM Plex
// Mono (estrutura: nav, botões, títulos, dados) — self-hosted via fontsource
// pra não depender de rede em runtime (Docker/dev sandbox sem internet).
import '@fontsource-variable/karla';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
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
