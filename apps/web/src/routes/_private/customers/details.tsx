import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useSearch } from '@tanstack/react-router';
import { z } from 'zod';
import { DefaultEmptyData } from '@/components/default-empty-data.js';
import { DefaultLoading } from '@/components/default-loading.js';
import { Card, CardContent, CardHeader } from '@/components/ui/card.js';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item.js';
import { formatDate } from '@/lib/helpers/formatDate.helper.js';
import { t } from '@/lib/helpers/translate.helper.js';
import { customerQuery } from '@/query/customer.js';
import { processesQuery } from '@/query/process.js';

// AD-030: `search: { id }`, nunca um `$customerId` path segment.
export const customerDetailsSearchSchema = z.object({ id: z.string().min(1) });
export type CustomerDetailsSearch = z.infer<typeof customerDetailsSearchSchema>;

// FND-10-style: `useSearch({strict:false})` (não `Route.useSearch()`) —
// mesmo motivo já documentado em customers/index.tsx (T18): o componente
// fica testável isolado do router real.
export function CustomerDetailsPage() {
  const search = useSearch({ strict: false }) as CustomerDetailsSearch;
  const customerQueryResult = useQuery(customerQuery(search.id));
  const processesQueryResult = useQuery(processesQuery(search.id));

  return (
    <Card asPage>
      <CardHeader title={t('customer.details.title')} />
      <CardContent>
        {customerQueryResult.isLoading ? (
          <DefaultLoading />
        ) : !customerQueryResult.data ? (
          // WEB-05 AC2: id ausente ou de outro tenant — estado explícito de
          // "não encontrado", nunca dados de outro tenant nem tela quebrada
          // (customerQuery já lança em success:false, então isLoading:false
          // + data:undefined cobre 404 E qualquer outra falha da mesma forma).
          <DefaultEmptyData />
        ) : (
          <div className="grid gap-6">
            <ItemGroup>
              <Item>
                <ItemContent>
                  <ItemTitle>{t('name')}</ItemTitle>
                  <ItemDescription>{customerQueryResult.data.name}</ItemDescription>
                </ItemContent>
              </Item>
              <Item>
                <ItemContent>
                  <ItemTitle>{t('phone')}</ItemTitle>
                  <ItemDescription>{customerQueryResult.data.phone}</ItemDescription>
                </ItemContent>
              </Item>
              {customerQueryResult.data.document && (
                <Item>
                  <ItemContent>
                    <ItemTitle>{t('document')}</ItemTitle>
                    <ItemDescription>{customerQueryResult.data.document}</ItemDescription>
                  </ItemContent>
                </Item>
              )}
              {Object.entries(customerQueryResult.data.values).map(([key, value]) => (
                <Item key={key}>
                  <ItemContent>
                    <ItemTitle>{key}</ItemTitle>
                    <ItemDescription>{String(value)}</ItemDescription>
                  </ItemContent>
                </Item>
              ))}
            </ItemGroup>

            <div className="grid gap-2">
              <ItemTitle>{t('customer.processes.title')}</ItemTitle>
              {processesQueryResult.isLoading ? (
                <DefaultLoading />
              ) : !processesQueryResult.data?.items.length ? (
                <DefaultEmptyData />
              ) : (
                <ItemGroup>
                  {processesQueryResult.data.items.map((process) => (
                    <Item key={process.id}>
                      <ItemContent>
                        <ItemTitle>{process.stage}</ItemTitle>
                        <ItemDescription>{formatDate(process.createdAt)}</ItemDescription>
                      </ItemContent>
                    </Item>
                  ))}
                </ItemGroup>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute('/_private/customers/details')({
  component: CustomerDetailsPage,
  staticData: { title: t('customer.details.title') },
  validateSearch: (search: Record<string, unknown>): CustomerDetailsSearch => customerDetailsSearchSchema.parse(search),
});
