import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate, useSearch } from '@tanstack/react-router';
import type { ColumnDef, OnChangeFn, PaginationState, SortingState } from '@tanstack/react-table';
import { useMemo } from 'react';
import { z } from 'zod';
import { DefaultEmptyData } from '@/components/default-empty-data.js';
import { DefaultLoading } from '@/components/default-loading.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardHeader } from '@/components/ui/card.js';
import { DataTable } from '@/components/ui/data-table.js';
import { formatMoney } from '@/lib/helpers/money.helper.js';
import { t } from '@/lib/helpers/translate.helper.js';
import { type ProductRecord, productsQuery } from '@/query/product.js';

// spec.md P1 "Cadastro de catálogo"/AC2: page/limit/name (busca por nome) —
// mesmo molde de customers/@interface/customers.interface.ts, sem `sort`/
// `order` (o back-end de Product, product.router.ts's listProductsQuerySchema,
// não aceita esses params — sempre ordena por createdAt desc).
export const productsSearchSchema = z.object({
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).optional().default(20),
  name: z.string().optional().default(''),
});
export type ProductsSearch = z.infer<typeof productsSearchSchema>;

// Nenhuma coluna é ordenável (o back-end não aceita `sort`) — mesmo
// raciocínio de inbox/@components/conversation-queue.tsx.
const productColumns: ColumnDef<ProductRecord, unknown>[] = [
  { accessorKey: 'name', header: t('name'), enableSorting: false },
  { id: 'price', header: t('product.price'), enableSorting: false, cell: ({ row }) => formatMoney(row.original.price) },
  { accessorKey: 'stock', header: t('product.stock'), enableSorting: false },
  {
    id: 'active',
    header: t('status'),
    enableSorting: false,
    cell: ({ row }) => t(row.original.active ? 'product.status.active' : 'product.status.inactive'),
  },
];

// design.md/T19: sem hub — index.tsx é a própria listagem (Product só tem
// list/add/details, ao contrário de Customer que também tem kanban). FND-10-
// style: useSearch({strict:false}) — mesmo motivo já documentado em
// customers/list/index.tsx/processes/add/index.tsx: o componente fica
// testável isolado do router real.
export function ProductsIndexPage() {
  const search = useSearch({ strict: false }) as ProductsSearch;
  const navigate = useNavigate();

  const query = useQuery(productsQuery({ page: search.page, limit: search.limit, name: search.name || undefined }));

  const pageCount = Math.max(1, Math.ceil((query.data?.total ?? 0) / search.limit));

  const tableState = useMemo(
    () => ({ pagination: { pageIndex: search.page - 1, pageSize: search.limit }, sorting: [] as SortingState }),
    [search.page, search.limit],
  );

  // AD-028: nunca re-busca a coleção inteira — só navega com um novo search
  // param, `productsQuery` (T18) refaz a chamada ao servidor com os
  // parâmetros corretos. `as any` no updater de `search`: mesmo workaround já
  // usado em customers/list/index.tsx (limitação conhecida desta versão do
  // TanStack Router, não um erro de tipo real).
  const handlePaginationChange: OnChangeFn<PaginationState> = (updater) => {
    const current: PaginationState = { pageIndex: search.page - 1, pageSize: search.limit };
    const next = typeof updater === 'function' ? updater(current) : updater;
    navigate({
      search: ((prev: ProductsSearch) => ({ ...prev, page: next.pageIndex + 1, limit: next.pageSize })) as any,
      replace: true,
    } as any);
  };

  const handleSearchChange = (value: string) => {
    navigate({ search: ((prev: ProductsSearch) => ({ ...prev, name: value, page: 1 })) as any, replace: true } as any);
  };

  const handleRowClick = (row: ProductRecord) => {
    navigate({ to: '/products/details', search: { id: row.id } });
  };

  return (
    <Card asPage>
      <CardHeader title={t('product.list.title')}>
        <CardAction>
          <Button asChild variant="basic">
            <Link to="/products/add">{t('add')}</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <DefaultLoading />
        ) : (
          <DataTable
            data={query.data?.items ?? []}
            columns={productColumns}
            pageCount={pageCount}
            state={tableState}
            onPaginationChange={handlePaginationChange}
            onSortingChange={() => {}}
            searchValue={search.name}
            onSearchChange={handleSearchChange}
            onRowClick={handleRowClick}
            emptyState={<DefaultEmptyData />}
          />
        )}
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute('/_private/products/')({
  component: ProductsIndexPage,
  staticData: { title: t('product.list.title') },
  validateSearch: (search: Record<string, unknown>): ProductsSearch => productsSearchSchema.parse(search),
});
