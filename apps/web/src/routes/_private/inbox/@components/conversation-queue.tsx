import { useQuery } from '@tanstack/react-query';
import type { ColumnDef, OnChangeFn, PaginationState, SortingState } from '@tanstack/react-table';
import { useState } from 'react';
import { DefaultLoading } from '@/components/default-loading.js';
import { Badge, BadgeIndicator } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { DataTable } from '@/components/ui/data-table.js';
import { formatDistanceToNow } from '@/lib/helpers/formatDate.helper.js';
import { t } from '@/lib/helpers/translate.helper.js';
import { type ConversationMode, type ConversationRecord, conversationsQuery } from '@/query/conversation.js';
import { sessionQuery } from '@/query/session.js';

const PAGE_SIZE = 20;

const MODE_FILTERS: { value: ConversationMode | undefined; label: string }[] = [
  { value: undefined, label: t('inbox.filter.mode.all') },
  { value: 'bot', label: t('inbox.mode.bot') },
  { value: 'human', label: t('inbox.mode.human') },
];

// SPEC_DEVIATION: `GET /conversations` (T7/T8) só devolve `assignee` como o
// ObjectId do User (conversation.repository.ts: `assignee: doc.assignee?.
// toString()`) — não existe endpoint de diretório de usuários exposto ao
// apps/web (fora do "Where" de T21-T26, que só tocam
// routes/_private/inbox/**). spec.md (P1/AC5) pede "o nome do assignee";
// como aproximação honesta dentro do escopo permitido, mostramos "Você"
// quando o assignee é o próprio operador da sessão (sessionQuery já
// carregada pelo guard de rota, AD-014) e "Outro operador" caso contrário —
// nunca o ObjectId cru. O único lugar onde o NOME real aparece é o toast de
// conflito 409 do takeover (takeover-badge.tsx, T26), porque ali quem monta
// a mensagem é o próprio back-end (conversation.service.ts,
// ConversationAlreadyAssignedError já resolve `User.name`).
const assigneeLabel = (conversation: ConversationRecord, selfId: string | undefined): string => {
  if (conversation.mode !== 'human' || !conversation.assignee) return '-';
  return conversation.assignee === selfId ? t('inbox.assignee.you') : t('inbox.assignee.other');
};

type ConversationQueueProps = { onSelect: (id: string) => void };

// INBOX-01/03/10 (design.md Componente 6): <DataTable> server-driven
// (AD-028) sobre conversationsQuery (T18) — nunca corta/filtra/pagina
// `items` em memória. Não há busca textual de conversas no back-end
// (conversation.router.ts só aceita mode/assignee/page/limit), então a
// caixa de busca embutida do <DataTable> (obrigatória, sem prop para
// esconder) é reaproveitada como o filtro de `assignee` já pedido pelo
// spec.md/design.md — digitar ali refaz a query server-side por esse
// campo, nunca filtra o array já carregado.
export function ConversationQueue({ onSelect }: ConversationQueueProps) {
  const [mode, setMode] = useState<ConversationMode | undefined>(undefined);
  const [assignee, setAssignee] = useState('');
  const [page, setPage] = useState(1);

  const sessionQueryResult = useQuery(sessionQuery);
  const query = useQuery(conversationsQuery({ mode, assignee: assignee || undefined, page, limit: PAGE_SIZE }));

  const pageCount = Math.max(1, Math.ceil((query.data?.total ?? 0) / PAGE_SIZE));
  const selfId = sessionQueryResult.data?.user.id;

  const columns: ColumnDef<ConversationRecord, unknown>[] = [
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
      cell: ({ row }) => assigneeLabel(row.original, selfId),
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

  const tableState = { pagination: { pageIndex: page - 1, pageSize: PAGE_SIZE }, sorting: [] as SortingState };

  const handlePaginationChange: OnChangeFn<PaginationState> = (updater) => {
    const current: PaginationState = { pageIndex: page - 1, pageSize: PAGE_SIZE };
    const next = typeof updater === 'function' ? updater(current) : updater;
    setPage(next.pageIndex + 1);
  };

  const handleAssigneeChange = (value: string) => {
    setAssignee(value);
    setPage(1);
  };

  const handleModeChange = (value: ConversationMode | undefined) => {
    setMode(value);
    setPage(1);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        {MODE_FILTERS.map((filter) => (
          <Button
            key={filter.label}
            type="button"
            size="sm"
            variant={mode === filter.value ? 'primary' : 'basic'}
            onClick={() => handleModeChange(filter.value)}
          >
            {filter.label}
          </Button>
        ))}
      </div>
      {query.isLoading ? (
        <DefaultLoading />
      ) : (
        <DataTable
          data={query.data?.items ?? []}
          columns={columns}
          pageCount={pageCount}
          state={tableState}
          onPaginationChange={handlePaginationChange}
          onSortingChange={() => {}}
          searchValue={assignee}
          onSearchChange={handleAssigneeChange}
          onRowClick={(row) => onSelect(row.id)}
        />
      )}
    </div>
  );
}
