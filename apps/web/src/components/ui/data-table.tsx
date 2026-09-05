import type { ColumnDef, OnChangeFn, PaginationState, SortingState } from '@tanstack/react-table';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { DefaultEmptyData } from '@/components/default-empty-data.js';
import { DefaultLoading } from '@/components/default-loading.js';
import IconDown from '@/components/icons/Down.Icon.js';
import IconLeft from '@/components/icons/Left.Icon.js';
import IconRight from '@/components/icons/Right.Icon.js';
import IconUp from '@/components/icons/Up.Icon.js';
import { t } from '@/lib/helpers/translate.helper.js';
import { Button } from './button.js';
import { Input } from './input.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table.js';

const SEARCH_DEBOUNCE_MS = 300;

export type DataTableProps<T> = {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  pageCount: number;
  state: { pagination: PaginationState; sorting: SortingState };
  onPaginationChange: OnChangeFn<PaginationState>;
  onSortingChange: OnChangeFn<SortingState>;
  searchValue: string;
  onSearchChange: (value: string) => void;
  loading?: boolean;
  emptyState?: ReactNode;
};

// AD-028: sempre manual (manualPagination/manualSorting/manualFiltering) —
// nunca re-ordena/filtra/pagina `data` localmente. O caller já buscou a
// página certa do servidor; getCoreRowModel() é o único row model usado.
export function DataTable<T>({
  data,
  columns,
  pageCount,
  state,
  onPaginationChange,
  onSortingChange,
  searchValue,
  onSearchChange,
  loading = false,
  emptyState,
}: DataTableProps<T>) {
  const [search, setSearch] = useState(searchValue);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => setSearch(searchValue), [searchValue]);
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const handleSearchInput = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onSearchChange(value), SEARCH_DEBOUNCE_MS);
  };

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
  const isEmpty = !loading && data.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <Input
        variant="primary"
        placeholder={t('search.placeholder')}
        value={search}
        onChange={(e) => handleSearchInput(e.target.value)}
      />

      {loading ? (
        <DefaultLoading />
      ) : isEmpty ? (
        (emptyState ?? <DefaultEmptyData />)
      ) : (
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
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!isEmpty && !loading && (
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
      )}
    </div>
  );
}
