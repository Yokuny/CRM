import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from './components/ui/sonner.js';
import './index.css';
import { queryClient, router } from './router.js';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Elemento #root não encontrado.');

// Toaster montado uma única vez na raiz (T11) — toast() de qualquer tela
// (ex.: erro do kanban, WEB-03) renderiza aqui, fora da árvore de rotas.
createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>
  </StrictMode>,
);
