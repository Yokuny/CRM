import type { ColumnDef, OnChangeFn, PaginationState } from '@tanstack/react-table';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { BadgeIndicator } from '@/components/ui/badge.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TablePagination,
  TableRow,
} from '@/components/ui/table.js';
import { formatMoney } from '@/lib/helpers/money.helper.js';
import { t } from '@/lib/helpers/translate.helper.js';
import type { ProductRecord } from '@/query/product.js';

// Nenhuma coluna é ordenável (o back-end não aceita `sort`) — mesmo
// raciocínio de inbox/@components/conversation-table.tsx.
const productColumns: ColumnDef<ProductRecord, unknown>[] = [
  { accessorKey: 'name', header: t('name'), enableSorting: false },
  { id: 'price', header: t('product.price'), enableSorting: false, cell: ({ row }) => formatMoney(row.original.price) },
  { accessorKey: 'stock', header: t('product.stock'), enableSorting: false },
  {
    id: 'active',
    header: t('status'),
    enableSorting: false,
    cell: ({ row }) => (
      <BadgeIndicator variant={row.original.active ? 'active' : 'neutral'}>
        {t(row.original.active ? 'product.status.active' : 'product.status.inactive')}
      </BadgeIndicator>
    ),
  },
];

type ProductsTableProps = {
  data: ProductRecord[];
  pageCount: number;
  pageIndex: number;
  pageSize: number;
  onPaginationChange: OnChangeFn<PaginationState>;
  onRowClick: (row: ProductRecord) => void;
};

// Uso direto de components/ui/table.tsx (sem o <DataTable> genérico
// removido, T19) — o toggle table/DefaultEmptyData e a busca (`name`) ficam
// em products/index.tsx.
export function ProductsTable({
  data,
  pageCount,
  pageIndex,
  pageSize,
  onPaginationChange,
  onRowClick,
}: ProductsTableProps) {
  const table = useReactTable({
    data,
    columns: productColumns,
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
            <TableRow key={row.id} onClick={() => onRowClick(row.original)} className="cursor-pointer">
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
