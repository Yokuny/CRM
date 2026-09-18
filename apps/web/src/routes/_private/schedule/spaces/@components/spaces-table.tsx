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
import { t } from '@/lib/helpers/translate.helper.js';
import type { SpaceRecord } from '@/query/space.js';

const spaceColumns: ColumnDef<SpaceRecord, unknown>[] = [
  { accessorKey: 'name', header: t('name'), enableSorting: false },
  {
    id: 'active',
    header: t('status'),
    enableSorting: false,
    cell: ({ row }) => (
      <BadgeIndicator variant={row.original.active ? 'active' : 'neutral'}>
        {t(row.original.active ? 'space.status.active' : 'space.status.inactive')}
      </BadgeIndicator>
    ),
  },
];

type SpacesTableProps = {
  data: SpaceRecord[];
  pageCount: number;
  pageIndex: number;
  pageSize: number;
  onPaginationChange: OnChangeFn<PaginationState>;
  onRowClick: (row: SpaceRecord) => void;
};

// Uso direto de components/ui/table.tsx (sem o <DataTable> genérico
// removido, T35) — mesmo raciocínio de schedule/professionals/@components:
// sem ordenação e sem busca (GET /spaces não aceita nenhum dos dois).
export function SpacesTable({
  data,
  pageCount,
  pageIndex,
  pageSize,
  onPaginationChange,
  onRowClick,
}: SpacesTableProps) {
  const table = useReactTable({
    data,
    columns: spaceColumns,
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
