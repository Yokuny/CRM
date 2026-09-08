import { createFileRoute, Outlet } from '@tanstack/react-router';

// Layout pathless puramente visual (sem guard) — telas de pré-autenticação
// (/auth, /invite) não têm hierarquia de páginas pra breadcrumb nem um
// "voltar" coerente (levaria a uma rota privada guardada, que redirecionaria
// de novo pra cá), por isso nenhuma delas usa <Card asPage>.
function PublicLayout() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-6 md:px-6">
      <Outlet />
    </div>
  );
}

export const Route = createFileRoute('/_public')({
  component: PublicLayout,
});
