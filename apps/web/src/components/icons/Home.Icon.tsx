import type { SVGProps } from 'react';

// Substituto estático do Home.Icon.tsx do front de referência (90 linhas,
// animado com framer-motion via useAnimation/motion.path — startAnimation no
// hover do link do breadcrumb). Mesmo desenho (casa + porta), sem a
// biblioteca de animação: nenhum outro lugar deste projeto usa
// framer-motion, e adicioná-la só por este ícone decorativo seria escopo
// além do que a Fase 2 pede.
const HomeIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
    viewBox="0 0 24 24"
    {...props}
  >
    <title>Home</title>
    <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
  </svg>
);

export { HomeIcon };
