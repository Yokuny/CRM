import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router';
import { Card, CardContent, CardHeader } from '@/components/ui/card.js';
import { useInboxSocket } from '@/hooks/useInboxSocket.js';
import { t } from '@/lib/helpers/translate.helper.js';
import { ConversationQueue } from './@components/conversation-queue.js';
import { ConversationThread } from './@components/thread.js';
import { type InboxSearch, inboxSearchSchema } from './@interface/inbox.interface.js';

// design.md, Componente 6: página ÚNICA (não hub — CLAUDE.md reserva hub só
// para >1 destino, e o Inbox só tem um: esta própria tela). Layout split —
// fila à esquerda, thread à direita — conversa selecionada via
// `search.id` (AD-030), sem `$id` dinâmico. `useInboxSocket` conectado aqui,
// no nível da página (design.md: "primeiro hook de WS do projeto"), para que
// a conexão sobreviva à troca de thread aberta sem precisar remontar.
//
// T21 criou o esqueleto com dois painéis placeholder; T22 substitui o
// painel esquerdo pela fila real (`ConversationQueue`); T23 substitui o
// painel direito pela thread real (`ConversationThread`) quando há uma
// conversa selecionada. Composer/badge (T25/T26) continuam a ser
// adicionados ao painel direito nas próximas tasks desta mesma fase.
export function InboxPage() {
  const search = useSearch({ strict: false }) as InboxSearch;
  const navigate = useNavigate();
  useInboxSocket(search.id);

  const handleSelect = (id: string) => navigate({ to: '/inbox', search: { id } });

  return (
    <Card asPage>
      <CardHeader title={t('inbox.title')} />
      <CardContent className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <ConversationQueue onSelect={handleSelect} />
        <div className="rounded-lg border p-4" data-testid="inbox-thread-panel">
          {search.id ? (
            <ConversationThread conversationId={search.id} />
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
