import { Link } from '@tanstack/react-router';
import { Home, Kanban, Users } from 'lucide-react';
import { t } from '@/lib/helpers/translate.helper.js';
import { cn } from '@/lib/utils.js';

const tileClassName = cn(
  'flex flex-1 flex-col items-center justify-center gap-1',
  'font-mono text-[10px] text-muted-foreground transition-colors',
  'data-[status=active]:text-foreground',
);

// Navegação mobile: bem mais simples que a referência (que tem Sheet+árvore
// de menu pra dezenas de rotas) porque o CRM só tem 3 destinos reais hoje.
// Navegação desktop continua 100% pelo breadcrumb (components/ui/card.tsx),
// por isso não existe sidebar aqui — só esta dock, escondida em md:.
export function MobileDock() {
  return (
    <nav
      aria-label={t('nav.primary')}
      className="fixed inset-x-0 bottom-0 z-50 flex h-16 items-stretch justify-around border-t bg-background md:hidden"
    >
      <Link to="/" activeOptions={{ exact: true }} className={tileClassName}>
        <Home className="size-5" />
        {t('home')}
      </Link>
      <Link to="/customers" className={tileClassName}>
        <Users className="size-5" />
        {t('customers')}
      </Link>
      <Link to="/customers/kanban" className={tileClassName}>
        <Kanban className="size-5" />
        {t('customers.view.kanban')}
      </Link>
    </nav>
  );
}
