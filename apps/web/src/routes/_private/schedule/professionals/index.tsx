import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate, useSearch } from '@tanstack/react-router';
import type { OnChangeFn, PaginationState } from '@tanstack/react-table';
import { z } from 'zod';
import { DefaultEmptyData } from '@/components/default-empty-data.js';
import { DefaultLoading } from '@/components/default-loading.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardHeader } from '@/components/ui/card.js';
import { Checkbox } from '@/components/ui/checkbox.js';
import { t } from '@/lib/helpers/translate.helper.js';
import { type ProfessionalRecord, professionalsQuery } from '@/query/professional.js';
import { ProfessionalsTable } from './@components/professionals-table.js';

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

// design.md/T34: sem hub — index.tsx é a própria listagem (CRUD coeso de uma
// entidade, precedente products/index.tsx). GET /professionals não aceita
// busca por texto (listProfessionalsQuerySchema, professional.router.ts só
// tem page/limit/active) — sem o <DataTable> genérico (que obrigava uma
// caixa de busca sem prop pra esconder), a listagem simplesmente não tem
// busca nenhuma aqui, diferente de products/index.tsx (`name`) ou
// conversation-queue.tsx (`assignee`), que de fato reaproveitam esse campo
// porque o back-end aceita aquele filtro. O filtro real desta tela
// (`active`, SCH-08) é o checkbox "Mostrar inativos" abaixo, que sim vira
// search param (AD-028, nunca filtro em memória).
export function ProfessionalsIndexPage() {
  const search = useSearch({ strict: false }) as ProfessionalsSearch;
  const navigate = useNavigate();

  const query = useQuery(
    professionalsQuery({ page: search.page, limit: search.limit, active: search.showInactive ? undefined : true }),
  );

  const pageCount = Math.max(1, Math.ceil((query.data?.total ?? 0) / search.limit));

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
          <Button variant="basic" render={<Link to="/schedule/professionals/add">{t('add')}</Link>} />
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
        ) : (query.data?.items.length ?? 0) === 0 ? (
          <DefaultEmptyData />
        ) : (
          <ProfessionalsTable
            data={query.data?.items ?? []}
            pageCount={pageCount}
            pageIndex={search.page - 1}
            pageSize={search.limit}
            onPaginationChange={handlePaginationChange}
            onRowClick={handleRowClick}
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
