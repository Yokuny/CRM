import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Calendar, Inbox, Kanban, Package, ShoppingCart, Users } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../../components/ui/card.js';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '../../components/ui/item.js';
import { t } from '../../lib/helpers/translate.helper.js';
import { sessionQuery } from '../../query/session.js';

// FND-10/AC2: shell mostra nome do Tenant e papel vindos de GET /auth/session.
// useSuspenseQuery lê o cache já populado por ensureQueryData no beforeLoad
// de _private.tsx — nenhum novo fetch, mesma fonte única de verdade.
// Abaixo, mesmo padrão de hub de navegação de customers/index.tsx/
// schedule/index.tsx: um card por seção top-level de _private/routes (não
// por página) — sem sidebar, este é o único ponto de descoberta dessas
// seções no desktop (apps/web/CLAUDE.md). `processes` fica de fora de
// propósito: não é seção própria, todo processo pertence a um cliente
// (ver processes/index.tsx).
export function PrivateIndexPage() {
  const { data } = useSuspenseQuery(sessionQuery);

  return (
    <Card asPage>
      <CardHeader title={data.tenant?.name ?? ''} />
      <CardContent>
        <ItemDescription>
          {t('private.role')}: {data.role.join(', ')}
        </ItemDescription>
        <ItemGroup variant="grid">
          <Item
            render={
              <Link to="/customers">
                <ItemMedia variant="icon">
                  <Users className="size-4" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{t('customers')}</ItemTitle>
                </ItemContent>
              </Link>
            }
          />
          <Item
            render={
              <Link to="/products">
                <ItemMedia variant="icon">
                  <Package className="size-4" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{t('product.list.title')}</ItemTitle>
                </ItemContent>
              </Link>
            }
          />
          <Item
            render={
              <Link to="/orders">
                <ItemMedia variant="icon">
                  <ShoppingCart className="size-4" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{t('order.list.title')}</ItemTitle>
                </ItemContent>
              </Link>
            }
          />
          <Item
            render={
              <Link to="/inbox">
                <ItemMedia variant="icon">
                  <Inbox className="size-4" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{t('inbox.title')}</ItemTitle>
                </ItemContent>
              </Link>
            }
          />
          <Item
            render={
              <Link to="/kanban">
                <ItemMedia variant="icon">
                  <Kanban className="size-4" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{t('kanban.board.list.title')}</ItemTitle>
                </ItemContent>
              </Link>
            }
          />
          <Item
            render={
              <Link to="/schedule">
                <ItemMedia variant="icon">
                  <Calendar className="size-4" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{t('schedule')}</ItemTitle>
                </ItemContent>
              </Link>
            }
          />
        </ItemGroup>
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute('/_private/')({
  component: PrivateIndexPage,
});
