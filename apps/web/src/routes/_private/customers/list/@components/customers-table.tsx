import type { StatusOption } from '@crm/contracts';
import type { OnChangeFn, PaginationState, SortingState } from '@tanstack/react-table';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import {
  ChevronDown as IconDown,
  ChevronLeft as IconLeft,
  ChevronRight as IconRight,
  ChevronUp as IconUp,
} from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.js';
import { t } from '@/lib/helpers/translate.helper.js';
import type { CustomerRecord } from '@/query/customer.js';
import { customerColumns } from '../../@utils/columns.js';

type CustomersTableProps = {
  data: CustomerRecord[];
  pageCount: number;
  state: { pagination: PaginationState; sorting: SortingState };
  statusOptions: StatusOption[];
  onPaginationChange: OnChangeFn<PaginationState>;
  onSortingChange: OnChangeFn<SortingState>;
  onRowClick: (row: CustomerRecord) => void;
};

// Uso direto de components/ui/table.tsx (sem o <DataTable> genérico
// removido) — o toggle table/DefaultEmptyData fica em list/index.tsx.
export function CustomersTable({
  data,
  pageCount,
  state,
  statusOptions,
  onPaginationChange,
  onSortingChange,
  onRowClick,
}: CustomersTableProps) {
  const columns = useMemo(() => customerColumns(statusOptions), [statusOptions]);
  const table = useReactTable({
    data,
    columns,
    pageCount,
    state,
    onPaginationChange,
    onSortingChange,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    getCoreRowModel: getCoreRowModel(),
  });

  const { pageIndex, pageSize } = state.pagination;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        type="button"
                        className="flex items-center gap-1"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === 'asc' && <IconUp className="size-3" />}
                        {header.column.getIsSorted() === 'desc' && <IconDown className="size-3" />}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
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
          size="icon-sm"
          onClick={() => onPaginationChange({ pageIndex: pageIndex - 1, pageSize })}
          disabled={pageIndex <= 0}
          aria-label={t('previous.page')}
        >
          <IconLeft className="size-4" />
        </Button>
        <Button
          type="button"
          variant="basic"
          size="icon-sm"
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
