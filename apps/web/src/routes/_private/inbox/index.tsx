import { createFileRoute, useSearch } from '@tanstack/react-router';
import { Card, CardContent, CardHeader } from '@/components/ui/card.js';
import { useInboxSocket } from '@/hooks/useInboxSocket.js';
import { t } from '@/lib/helpers/translate.helper.js';
import { type InboxSearch, inboxSearchSchema } from './@interface/inbox.interface.js';

// design.md, Componente 6: página ÚNICA (não hub — CLAUDE.md reserva hub só
// para >1 destino, e o Inbox só tem um: esta própria tela). Layout split —
// fila à esquerda, thread à direita — conversa selecionada via
// `search.id` (AD-030), sem `$id` dinâmico. `useInboxSocket` conectado aqui,
// no nível da página (design.md: "primeiro hook de WS do projeto"), para que
// a conexão sobreviva à troca de thread aberta sem precisar remontar.
//
// T21 é só o esqueleto: os dois painéis abaixo são placeholders — T22
// (`conversation-queue.tsx`), T23 (`thread.tsx`), T25 (`composer.tsx`) e T26
// (`takeover-badge.tsx`) substituem cada um pelo componente real nas
// próximas tasks desta mesma fase.
export function InboxPage() {
  const search = useSearch({ strict: false }) as InboxSearch;
  useInboxSocket(search.id);

  return (
    <Card asPage>
      <CardHeader title={t('inbox.title')} />
      <CardContent className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="rounded-lg border p-4" data-testid="inbox-queue-panel">
          {t('inbox.queue.title')}
        </div>
        <div className="rounded-lg border p-4" data-testid="inbox-thread-panel">
          {search.id ? (
            <p data-testid="inbox-selected-conversation">{search.id}</p>
          ) : (
            <p className="text-muted-foreground text-sm">{t('inbox.thread.select_hint')}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute('/_private/inbox/')({
  component: InboxPage,
  staticData: { title: t('inbox.title') },
  validateSearch: (search: Record<string, unknown>): InboxSearch => inboxSearchSchema.parse(search),
});
