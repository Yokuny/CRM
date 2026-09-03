import type { ReactNode } from 'react';

// SPEC_DEVIATION: versão mínima de `<Card asPage>` — o design system completo
// (ShadCN + Tailwind) é escopo da feature 4 (crm-web-shell; spec.md, Out of
// Scope: "sistema de layout"). Mantém só a FORMA que a convenção de página do
// front de referência exige (Card asPage + CardHeader + CardContent), sem
// nenhuma dependência de UI library.
export function Card({ asPage, children }: { asPage?: boolean; children: ReactNode }) {
  return <section data-page={asPage ? 'true' : undefined}>{children}</section>;
}

export function CardHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header>
      <h1>{title}</h1>
      {children}
    </header>
  );
}

export function CardContent({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}
