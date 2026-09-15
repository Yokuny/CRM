import { useQuery } from '@tanstack/react-query';
import type { OnChangeFn, PaginationState } from '@tanstack/react-table';
import { useState } from 'react';
import { DefaultEmptyData } from '@/components/default-empty-data.js';
import { DefaultLoading } from '@/components/default-loading.js';
import { Button } from '@/components/ui/button.js';
import { ButtonGroup } from '@/components/ui/button-group.js';
import { Input } from '@/components/ui/input.js';
import { useDebouncedSearch } from '@/hooks/useDebouncedSearch.js';
import { t } from '@/lib/helpers/translate.helper.js';
import { type ConversationMode, conversationsQuery } from '@/query/conversation.js';
import { ConversationTable } from './conversation-table.js';

const PAGE_SIZE = 20;

const MODE_FILTERS: { value: ConversationMode | undefined; label: string }[] = [
  { value: undefined, label: t('inbox.filter.mode.all') },
  { value: 'bot', label: t('inbox.mode.bot') },
  { value: 'human', label: t('inbox.mode.human') },
];

type ConversationQueueProps = { onSelect: (id: string) => void };

// INBOX-01/03/10 (design.md Componente 6): uso direto de
// components/ui/table.tsx (sem o <DataTable> genérico removido, T22) sobre
// conversationsQuery (T18) — nunca corta/filtra/pagina `items` em memória.
// Não há busca textual de conversas no back-end (conversation.router.ts só
// aceita mode/assignee/page/limit), então o campo de busca abaixo é
// reaproveitado como o filtro de `assignee` já pedido pelo spec.md/design.md
// — digitar ali refaz a query server-side por esse campo, nunca filtra o
// array já carregado.
export function ConversationQueue({ onSelect }: ConversationQueueProps) {
  const [mode, setMode] = useState<ConversationMode | undefined>(undefined);
  const [assignee, setAssignee] = useState('');
  const [page, setPage] = useState(1);

  const query = useQuery(conversationsQuery({ mode, assignee: assignee || undefined, page, limit: PAGE_SIZE }));

  const pageCount = Math.max(1, Math.ceil((query.data?.total ?? 0) / PAGE_SIZE));

  const handlePaginationChange: OnChangeFn<PaginationState> = (updater) => {
    const current: PaginationState = { pageIndex: page - 1, pageSize: PAGE_SIZE };
    const next = typeof updater === 'function' ? updater(current) : updater;
    setPage(next.pageIndex + 1);
  };

  const handleAssigneeChange = (value: string) => {
    setAssignee(value);
    setPage(1);
  };

  const [searchInput, handleSearchInput] = useDebouncedSearch(assignee, handleAssigneeChange);

  const handleModeChange = (value: ConversationMode | undefined) => {
    setMode(value);
    setPage(1);
  };

  return (
    <div className="flex flex-col gap-3">
      <ButtonGroup>
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
      </ButtonGroup>
      <Input
        placeholder={t('search.placeholder')}
        value={searchInput}
        onChange={(e) => handleSearchInput(e.target.value)}
      />
      {query.isLoading ? (
        <DefaultLoading />
      ) : (query.data?.items.length ?? 0) === 0 ? (
        <DefaultEmptyData />
      ) : (
        <ConversationTable
          data={query.data?.items ?? []}
          pageCount={pageCount}
          pageIndex={page - 1}
          pageSize={PAGE_SIZE}
          onPaginationChange={handlePaginationChange}
          onRowClick={(row) => onSelect(row.id)}
        />
      )}
    </div>
  );
}
