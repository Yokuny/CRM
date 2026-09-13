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
import { type ProfessionalRecord, professionalsQuery } from '@/query/professional.js';

// spec.md SCH-01/SCH-08: page/limit + `showInactive` (AD-030-style: um nome
// próprio de search em vez de `active` cru, já que a UI é um checkbox
// "Mostrar inativos", não um valor boolean direto) — mesmo molde de
// productsSearchSchema, sem `name` (GET /professionals não aceita busca por
// texto, professional.router.ts's listProfessionalsQuerySchema só tem
// page/limit/active).
export const professionalsSearchSchema = z.object({
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).optional().default(20),
  showInactive: z.boolean().optional().default(false),
});
export type ProfessionalsSearch = z.infer<typeof professionalsSearchSchema>;

const professionalColumns: ColumnDef<ProfessionalRecord, unknown>[] = [
  { accessorKey: 'name', header: t('name'), enableSorting: false },
  { accessorKey: 'slotDurationMinutes', header: t('professional.slot_duration'), enableSorting: false },
  {
    id: 'active',
    header: t('status'),
    enableSorting: false,
    cell: ({ row }) => t(row.original.active ? 'professional.status.active' : 'professional.status.inactive'),
  },
];

// design.md/T34: sem hub — index.tsx é a própria listagem (CRUD coeso de uma
// entidade, precedente products/index.tsx). GET /professionals não aceita
// busca por texto (listProfessionalsQuerySchema, professional.router.ts só
// tem page/limit/active) — a caixa de busca embutida do <DataTable>
// (obrigatória, sem prop pra esconder) fica inerte aqui, diferente de
// products/index.tsx (`name`) ou conversation-queue.tsx (`assignee`), que
// reaproveitam a caixa porque o back-end de fato aceita aquele filtro. O
// filtro real desta tela (`active`, SCH-08) é o checkbox "Mostrar inativos"
// abaixo, que sim vira search param (AD-028, nunca filtro em memória).
export function ProfessionalsIndexPage() {
  const search = useSearch({ strict: false }) as ProfessionalsSearch;
  const navigate = useNavigate();

  const query = useQuery(
    professionalsQuery({ page: search.page, limit: search.limit, active: search.showInactive ? undefined : true }),
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
      search: ((prev: ProfessionalsSearch) => ({ ...prev, page: next.pageIndex + 1, limit: next.pageSize })) as any,
      replace: true,
    } as any);
  };

  const handleShowInactiveChange = (checked: boolean) => {
    navigate({
      search: ((prev: ProfessionalsSearch) => ({ ...prev, showInactive: checked, page: 1 })) as any,
      replace: true,
    } as any);
  };

  const handleRowClick = (row: ProfessionalRecord) => {
    navigate({ to: '/schedule/professionals/details', search: { id: row.id } });
  };

  return (
    <Card asPage>
      <CardHeader title={t('professional.list.title')}>
        <CardAction>
          <Button asChild variant="basic">
            <Link to="/schedule/professionals/add">{t('add')}</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="mb-3">
          <Checkbox
            label={t('professional.filter.show_inactive')}
            checked={search.showInactive}
            onCheckedChange={(checked) => handleShowInactiveChange(checked === true)}
          />
        </div>
        {query.isLoading ? (
          <DefaultLoading />
        ) : (
          <DataTable
            data={query.data?.items ?? []}
            columns={professionalColumns}
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

export const Route = createFileRoute('/_private/schedule/professionals/')({
  component: ProfessionalsIndexPage,
  staticData: { title: t('professional.list.title') },
  validateSearch: (search: Record<string, unknown>): ProfessionalsSearch => professionalsSearchSchema.parse(search),
});
