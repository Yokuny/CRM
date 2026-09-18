import type { ColumnDef, OnChangeFn, PaginationState } from '@tanstack/react-table';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TablePagination,
  TableRow,
} from '@/components/ui/table.js';
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
    <>
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
      <TablePagination
        pageIndex={pageIndex}
        pageSize={pageSize}
        pageCount={pageCount}
        onPaginationChange={onPaginationChange}
      />
    </>
  );
}
