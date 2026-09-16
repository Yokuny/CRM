import type { ColumnDef, OnChangeFn, PaginationState } from '@tanstack/react-table';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { ChevronLeft as IconLeft, ChevronRight as IconRight } from 'lucide-react';
import { BadgeIndicator } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.js';
import { t } from '@/lib/helpers/translate.helper.js';
import type { ProfessionalRecord } from '@/query/professional.js';

const professionalColumns: ColumnDef<ProfessionalRecord, unknown>[] = [
  { accessorKey: 'name', header: t('name'), enableSorting: false },
  { accessorKey: 'slotDurationMinutes', header: t('professional.slot_duration'), enableSorting: false },
  {
    id: 'active',
    header: t('status'),
    enableSorting: false,
    cell: ({ row }) => (
      <BadgeIndicator variant={row.original.active ? 'active' : 'neutral'}>
        {t(row.original.active ? 'professional.status.active' : 'professional.status.inactive')}
      </BadgeIndicator>
    ),
  },
];

type ProfessionalsTableProps = {
  data: ProfessionalRecord[];
  pageCount: number;
  pageIndex: number;
  pageSize: number;
  onPaginationChange: OnChangeFn<PaginationState>;
  onRowClick: (row: ProfessionalRecord) => void;
};

// Uso direto de components/ui/table.tsx (sem o <DataTable> genérico
// removido, T34) — sem coluna ordenável (listProfessionalsQuerySchema não
// aceita `sort`) e sem busca (GET /professionals não aceita texto), então
// nenhuma dessas duas peças do antigo <DataTable> aparece aqui.
export function ProfessionalsTable({
  data,
  pageCount,
  pageIndex,
  pageSize,
  onPaginationChange,
  onRowClick,
}: ProfessionalsTableProps) {
  const table = useReactTable({
    data,
    columns: professionalColumns,
    pageCount,
    state: { pagination: { pageIndex, pageSize } },
    onPaginationChange,
    manualPagination: true,
    manualFiltering: true,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} onClick={() => onRowClick(row.original)} className="cursor-pointer">
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end gap-2">
        <span className="text-muted-foreground text-sm">
          {t('table.page')} {pageIndex + 1} / {Math.max(pageCount, 1)}
        </span>
        <Button
          type="button"
          variant="basic"
          onClick={() => onPaginationChange({ pageIndex: pageIndex - 1, pageSize })}
          disabled={pageIndex <= 0}
          aria-label={t('previous.page')}
        >
          <IconLeft className="size-4" />
        </Button>
        <Button
          type="button"
          variant="basic"
          onClick={() => onPaginationChange({ pageIndex: pageIndex + 1, pageSize })}
          disabled={pageIndex + 1 >= pageCount}
          aria-label={t('next.page')}
        >
          <IconRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
