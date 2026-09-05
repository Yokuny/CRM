import { Link } from '@tanstack/react-router';
import { t } from '@/lib/helpers/translate.helper.js';
import { cn } from '@/lib/utils.js';

// "Tabs-style" via <Link> real (não Tabs/TabsTrigger): design.md deixa as
// duas formas em aberto — um <Link> preserva a semântica nativa de
// navegação (abrir em nova aba, etc.) que um TabsTrigger (um <button>) não
// tem, e o `data-status="active"` que o próprio TanStack Router já aplica
// no link cujo alvo é a rota atual cobre o estilo "aba ativa" sem estado
// próprio. As duas rotas (`_private/customers/index.tsx` e
// `.../kanban/index.tsx`) são irmãs na árvore de rotas (nenhuma layout
// pathless as aninha), então o link de `/customers` nunca fica "ativo"
// visitando `/customers/kanban` mesmo sem `activeOptions.exact` — mantido
// aqui só por defesa/clareza.
const linkClassName = cn(
  'relative inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap px-4',
  'font-medium font-mono text-sm text-muted-foreground transition-colors hover:text-foreground',
  'border-transparent border-b-2 data-[status=active]:border-primary data-[status=active]:text-foreground',
);

export function CustomersViewToggle() {
  return (
    <div className="flex items-center">
      <Link to="/customers" activeOptions={{ exact: true }} className={linkClassName}>
        {t('customers.view.table')}
      </Link>
      <Link to="/customers/kanban" className={linkClassName}>
        {t('customers.view.kanban')}
      </Link>
    </div>
  );
}
