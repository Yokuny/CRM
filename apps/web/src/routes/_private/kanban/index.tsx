import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { DefaultEmptyData } from '@/components/default-empty-data.js';
import { DefaultLoading } from '@/components/default-loading.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardHeader } from '@/components/ui/card.js';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item.js';
import { t } from '@/lib/helpers/translate.helper.js';
import { boardsQuery } from '@/query/board.js';

// design.md/T15: sem paginação (spec.md Assumptions — volume de boards por
// tenant esperado baixo), então index.tsx é a própria listagem — mesmo
// raciocínio de products/index.tsx ("sem hub"), não um redirect() nem um
// grid de cards-destino: os boards SÃO os destinos.
export function KanbanIndexPage() {
  const query = useQuery(boardsQuery());

  return (
    <Card asPage>
      <CardHeader title={t('boards')}>
        <CardAction>
          <Button variant="basic" render={<Link to="/kanban/add">{t('add')}</Link>} />
        </CardAction>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <DefaultLoading />
        ) : !query.data?.length ? (
          // spec.md Edge Cases: hub sem nenhum board -> DefaultEmptyData com
          // atalho pra criar o primeiro (o botão "Adicionar" do CardHeader
          // já cobre o atalho).
          <DefaultEmptyData />
        ) : (
          <ItemGroup>
            {query.data.map((board) => (
              // AD-030: search:{id}, nunca um `$id` path segment.
              <Item
                key={board.id}
                render={
                  <Link to="/kanban/details" search={{ id: board.id }}>
                    <ItemContent>
                      <ItemTitle>{board.name}</ItemTitle>
                      {board.description && <ItemDescription>{board.description}</ItemDescription>}
                    </ItemContent>
                    <ItemContent>
                      <ItemDescription>
                        {board.cardCount} {t(board.cardCount === 1 ? 'card' : 'cards')}
                      </ItemDescription>
                    </ItemContent>
                  </Link>
                }
              />
            ))}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute('/_private/kanban/')({
  component: KanbanIndexPage,
  staticData: { title: t('boards') },
});
