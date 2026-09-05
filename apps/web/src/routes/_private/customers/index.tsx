import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router';
import type { OnChangeFn, PaginationState, SortingState } from '@tanstack/react-table';
import { useMemo } from 'react';
import { DefaultEmptyData } from '@/components/default-empty-data.js';
import { DefaultLoading } from '@/components/default-loading.js';
import { Card, CardContent, CardHeader } from '@/components/ui/card.js';
import { DataTable } from '@/components/ui/data-table.js';
import { t } from '@/lib/helpers/translate.helper.js';
import { customersQuery } from '@/query/customer.js';
import { type CustomersSearch, customersSearchSchema } from './@interface/customers.interface.js';
import { customerColumns } from './@utils/columns.js';

// FND-10-style: useSearch({strict:false}) (não Route.useSearch()) — o
// componente fica testável isolado do router real, mesmo convenção já usada
// em invite/index.tsx e auth/index.tsx (T7/T8).
export function CustomersListPage() {
  const search = useSearch({ strict: false }) as CustomersSearch;
  const navigate = useNavigate();

  const query = useQuery(
    customersQuery({
      page: search.page,
      limit: search.limit,
      q: search.q || undefined,
      sort: search.sort,
      order: search.order,
      status: search.status,
    }),
  );

  const pageCount = Math.max(1, Math.ceil((query.data?.total ?? 0) / search.limit));

  const tableState = useMemo(
    () => ({
      pagination: { pageIndex: search.page - 1, pageSize: search.limit },
      sorting: [{ id: search.sort, desc: search.order === 'desc' }] as SortingState,
    }),
    [search.page, search.limit, search.sort, search.order],
  );

  // WEB-01 AC3 + WEB-09: nunca re-busca a coleção inteira — só navega com um
  // novo search param, e o próprio `customersQuery` (T17) refaz a chamada ao
  // servidor com os parâmetros corretos.
  // `as any` no updater de `search`: mesmo workaround do `usePatientList.ts`
  // de referência — `useNavigate()` sem `from` não infere o shape de
  // `CustomersSearch` para o updater funcional, é uma limitação conhecida
  // desta versão do TanStack Router, não um erro de tipo real.
  const handlePaginationChange: OnChangeFn<PaginationState> = (updater) => {
    const current: PaginationState = { pageIndex: search.page - 1, pageSize: search.limit };
    const next = typeof updater === 'function' ? updater(current) : updater;
    navigate({
      search: ((prev: CustomersSearch) => ({ ...prev, page: next.pageIndex + 1, limit: next.pageSize })) as any,
      replace: true,
    } as any);
  };

  const handleSortingChange: OnChangeFn<SortingState> = (updater) => {
    const current: SortingState = [{ id: search.sort, desc: search.order === 'desc' }];
    const next = typeof updater === 'function' ? updater(current) : updater;
    const first = next[0];
    navigate({
      search: ((prev: CustomersSearch) => ({
        ...prev,
        sort: (first?.id as CustomersSearch['sort']) ?? 'createdAt',
        order: first ? (first.desc ? 'desc' : 'asc') : 'desc',
        page: 1,
      })) as any,
      replace: true,
    } as any);
  };

  const handleSearchChange = (value: string) => {
    navigate({ search: ((prev: CustomersSearch) => ({ ...prev, q: value, page: 1 })) as any, replace: true } as any);
  };

  return (
    <Card asPage>
      <CardHeader title={t('customers')} />
      <CardContent>
        {query.isLoading ? (
          <DefaultLoading />
        ) : (
          <DataTable
            data={query.data?.items ?? []}
            columns={customerColumns}
            pageCount={pageCount}
            state={tableState}
            onPaginationChange={handlePaginationChange}
            onSortingChange={handleSortingChange}
            searchValue={search.q}
            onSearchChange={handleSearchChange}
            emptyState={<DefaultEmptyData />}
          />
        )}
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute('/_private/customers/')({
  component: CustomersListPage,
  staticData: { title: t('customers') },
  validateSearch: (search: Record<string, unknown>): CustomersSearch => customersSearchSchema.parse(search),
});
