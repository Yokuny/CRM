import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Calendar, Users } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../../components/ui/card.js';
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '../../components/ui/item.js';
import { t } from '../../lib/helpers/translate.helper.js';
import { sessionQuery } from '../../query/session.js';

// FND-10/AC2: shell mostra nome do Tenant e papel vindos de GET /auth/session.
// useSuspenseQuery lê o cache já populado por ensureQueryData no beforeLoad
// de _private.tsx — nenhum novo fetch, mesma fonte única de verdade.
// Abaixo, mesmo padrão de hub de navegação de settings/index.tsx de
// referência (e de customers/index.tsx, processes/index.tsx) — só tem 1
// seção hoje (Clientes), mas a estrutura já escala pra mais seções futuras.
export function PrivateIndexPage() {
  const { data } = useSuspenseQuery(sessionQuery);

  return (
    <Card asPage>
      <CardHeader title={data.tenant?.name ?? ''} />
      <CardContent className="flex flex-col gap-4">
        <ItemDescription>
          {t('private.role')}: {data.role.join(', ')}
        </ItemDescription>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Item variant="outline" asChild>
            <Link to="/customers">
              <ItemMedia variant="icon">
                <Users className="size-4" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{t('customers')}</ItemTitle>
              </ItemContent>
            </Link>
          </Item>
          <Item variant="outline" asChild>
            <Link to="/schedule">
              <ItemMedia variant="icon">
                <Calendar className="size-4" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{t('schedule')}</ItemTitle>
              </ItemContent>
            </Link>
          </Item>
        </div>
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute('/_private/')({
  component: PrivateIndexPage,
});
