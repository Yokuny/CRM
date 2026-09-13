import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate, useSearch } from '@tanstack/react-router';
import type { ColumnDef, OnChangeFn, PaginationState, SortingState } from '@tanstack/react-table';
import { useMemo } from 'react';
import { z } from 'zod';
import { DefaultEmptyData } from '@/components/default-empty-data.js';
import { DefaultLoading } from '@/components/default-loading.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardHeader } from '@/components/ui/card.js';
import { Checkbox } from '@/components/ui/checkbox.js';
import { DataTable } from '@/components/ui/data-table.js';
import { t } from '@/lib/helpers/translate.helper.js';
import { type SpaceRecord, spacesQuery } from '@/query/space.js';

// spec.md SCH-04/SCH-08: page/limit + `showInactive` — mesmo molde de
// schedule/professionals/index.tsx (professionalsSearchSchema), sem `name`
// (GET /spaces não aceita busca por texto, space.router.ts's
// listSpacesQuerySchema só tem page/limit/active).
export const spacesSearchSchema = z.object({
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).optional().default(20),
  showInactive: z.boolean().optional().default(false),
});
export type SpacesSearch = z.infer<typeof spacesSearchSchema>;

const spaceColumns: ColumnDef<SpaceRecord, unknown>[] = [
  { accessorKey: 'name', header: t('name'), enableSorting: false },
  {
    id: 'active',
    header: t('status'),
    enableSorting: false,
    cell: ({ row }) => t(row.original.active ? 'space.status.active' : 'space.status.inactive'),
  },
];

// design.md/T35: sem hub — index.tsx é a própria listagem (CRUD coeso de uma
// entidade de um campo, mesmo padrão de schedule/professionals/index.tsx —
// T34). GET /spaces não aceita busca por texto (listSpacesQuerySchema,
// space.router.ts só tem page/limit/active) — a caixa de busca embutida do
// <DataTable> (obrigatória, sem prop pra esconder) fica inerte aqui, mesmo
// raciocínio já documentado em schedule/professionals/index.tsx. O filtro
// real (`active`, SCH-08) é o checkbox "Mostrar inativos" abaixo (AD-028,
// nunca filtro em memória).
export function SpacesIndexPage() {
  const search = useSearch({ strict: false }) as SpacesSearch;
  const navigate = useNavigate();

  const query = useQuery(
    spacesQuery({ page: search.page, limit: search.limit, active: search.showInactive ? undefined : true }),
  );

  const pageCount = Math.max(1, Math.ceil((query.data?.total ?? 0) / search.limit));

  const tableState = useMemo(
    () => ({ pagination: { pageIndex: search.page - 1, pageSize: search.limit }, sorting: [] as SortingState }),
    [search.page, search.limit],
  );

  const handlePaginationChange: OnChangeFn<PaginationState> = (updater) => {
    const current: PaginationState = { pageIndex: search.page - 1, pageSize: search.limit };
    const next = typeof updater === 'function' ? updater(current) : updater;
    navigate({
      search: ((prev: SpacesSearch) => ({ ...prev, page: next.pageIndex + 1, limit: next.pageSize })) as any,
      replace: true,
    } as any);
  };

  const handleShowInactiveChange = (checked: boolean) => {
    navigate({
      search: ((prev: SpacesSearch) => ({ ...prev, showInactive: checked, page: 1 })) as any,
      replace: true,
    } as any);
  };

  const handleRowClick = (row: SpaceRecord) => {
    navigate({ to: '/schedule/spaces/details', search: { id: row.id } });
  };

  return (
    <Card asPage>
      <CardHeader title={t('space.list.title')}>
        <CardAction>
          <Button asChild variant="basic">
            <Link to="/schedule/spaces/add">{t('add')}</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="mb-3">
          <Checkbox
            label={t('space.filter.show_inactive')}
            checked={search.showInactive}
            onCheckedChange={(checked) => handleShowInactiveChange(checked === true)}
          />
        </div>
        {query.isLoading ? (
          <DefaultLoading />
        ) : (
          <DataTable
            data={query.data?.items ?? []}
            columns={spaceColumns}
            pageCount={pageCount}
            state={tableState}
            onPaginationChange={handlePaginationChange}
            onSortingChange={() => {}}
            searchValue=""
            onSearchChange={() => {}}
            onRowClick={handleRowClick}
            emptyState={<DefaultEmptyData />}
          />
        )}
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute('/_private/schedule/spaces/')({
  component: SpacesIndexPage,
  staticData: { title: t('space.list.title') },
  validateSearch: (search: Record<string, unknown>): SpacesSearch => spacesSearchSchema.parse(search),
});
