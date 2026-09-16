import type { ColumnDef, OnChangeFn, PaginationState } from '@tanstack/react-table';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { ChevronLeft as IconLeft, ChevronRight as IconRight } from 'lucide-react';
import { Button } from '@/components/ui/button.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.js';
import { t } from '@/lib/helpers/translate.helper.js';
import type { OrderRecord } from '@/query/order.js';

type OrdersTableProps = {
  data: OrderRecord[];
  columns: ColumnDef<OrderRecord, unknown>[];
  pageCount: number;
  pageIndex: number;
  pageSize: number;
  onPaginationChange: OnChangeFn<PaginationState>;
};

// Uso direto de components/ui/table.tsx (sem o <DataTable> genérico
// removido, T23). `columns` continua vindo de orders/index.tsx porque as
// células de Aprovar/Rejeitar dependem de handlers/estado de mutation que só
// existem lá (spec.md AC2) — este componente só sabe renderizar a tabela.
export function OrdersTable({ data, columns, pageCount, pageIndex, pageSize, onPaginationChange }: OrdersTableProps) {
  const table = useReactTable({
    data,
    columns,
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
              <TableRow key={row.id}>
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
