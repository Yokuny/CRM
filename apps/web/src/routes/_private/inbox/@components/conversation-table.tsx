import type { ColumnDef, OnChangeFn, PaginationState } from '@tanstack/react-table';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { ChevronLeft as IconLeft, ChevronRight as IconRight } from 'lucide-react';
import { Badge, BadgeIndicator } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.js';
import { formatDistanceToNow } from '@/lib/helpers/formatDate.helper.js';
import { t } from '@/lib/helpers/translate.helper.js';
import type { ConversationRecord } from '@/query/conversation.js';

// INBOX-10/AC5 (Fix 1, validation.md): `GET /conversations` agora resolve
// `assigneeName` no back-end (conversation.service.ts) — spec.md pede
// literalmente "o nome do assignee" quando mode:'human', sem exigir uma
// distinção "é você"/"é outro operador"; mostra o nome real sempre que
// existir.
const assigneeLabel = (conversation: ConversationRecord): string =>
  conversation.mode === 'human' && conversation.assigneeName ? conversation.assigneeName : '-';

const conversationColumns: ColumnDef<ConversationRecord, unknown>[] = [
  { accessorKey: 'customer', header: t('inbox.column.customer'), enableSorting: false },
  {
    id: 'mode',
    header: t('inbox.column.mode'),
    enableSorting: false,
    cell: ({ row }) => (
      <Badge variant={row.original.mode === 'human' ? 'success' : 'secondary'}>
        {t(row.original.mode === 'human' ? 'inbox.mode.human' : 'inbox.mode.bot')}
      </Badge>
    ),
  },
  {
    id: 'assignee',
    header: t('inbox.column.assignee'),
    enableSorting: false,
    cell: ({ row }) => assigneeLabel(row.original),
  },
  {
    id: 'lastActivityAt',
    header: t('inbox.column.last_activity'),
    enableSorting: false,
    cell: ({ row }) => formatDistanceToNow(row.original.lastActivityAt, { addSuffix: true }),
  },
  {
    id: 'unread',
    header: t('inbox.column.unread'),
    enableSorting: false,
    cell: ({ row }) =>
      row.original.unread ? (
        // BadgeIndicatorProps.variant é tipado como SystemStatus
        // (components/ui/badge.tsx) — não inclui um estado genérico
        // "unread"/"warning"; 'pending' é o mais próximo semanticamente
        // (algo aguardando atenção do operador) e já resolve pra amarelo
        // no indicatorColorMap do próprio componente.
        <BadgeIndicator variant="pending" pulse>
          {t('inbox.unread.yes')}
        </BadgeIndicator>
      ) : null,
  },
  {
    id: 'window',
    header: t('inbox.column.window'),
    enableSorting: false,
    cell: ({ row }) => (
      <Badge variant={row.original.windowOpen ? 'success' : 'muted'}>
        {t(row.original.windowOpen ? 'inbox.window.open' : 'inbox.window.closed')}
      </Badge>
    ),
  },
];

type ConversationTableProps = {
  data: ConversationRecord[];
  pageCount: number;
  pageIndex: number;
  pageSize: number;
  onPaginationChange: OnChangeFn<PaginationState>;
  onRowClick: (row: ConversationRecord) => void;
};

// Uso direto de components/ui/table.tsx (sem o <DataTable> genérico
// removido, T22) — o toggle table/DefaultEmptyData e a busca (`assignee`)
// ficam em conversation-queue.tsx, que é a "página" desta lista (INBOX-01/03/10).
export function ConversationTable({
  data,
  pageCount,
  pageIndex,
  pageSize,
  onPaginationChange,
  onRowClick,
}: ConversationTableProps) {
  const table = useReactTable({
    data,
    columns: conversationColumns,
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
