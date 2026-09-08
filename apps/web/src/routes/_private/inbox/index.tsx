import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router';
import { Card, CardContent, CardHeader } from '@/components/ui/card.js';
import { useInboxSocket } from '@/hooks/useInboxSocket.js';
import { t } from '@/lib/helpers/translate.helper.js';
import { conversationsQuery } from '@/query/conversation.js';
import { Composer, ResendButton } from './@components/composer.js';
import { ConversationQueue } from './@components/conversation-queue.js';
import { TakeoverBadge } from './@components/takeover-badge.js';
import { ConversationThread } from './@components/thread.js';
import { type InboxSearch, inboxSearchSchema } from './@interface/inbox.interface.js';

// SPEC_DEVIATION herdado de query/conversation.ts (T18): não existe `GET
// /conversations/:id` — resolver UMA Conversation por `search.id` exige
// filtrar `items` de `conversationsQuery` (mesmo precedente de
// query/process.ts). Como a fila (T22) tem sua PRÓPRIA query filtrada/
// paginada (que pode não conter a conversa aberta, ex.: filtro ativo ou
// página diferente), esta página faz uma segunda busca dedicada, sem
// filtro e com o maior limite aceito pelo back-end (MAX_PAGE_SIZE,
// conversation.service.ts), só para resolver a conversa selecionada —
// necessária a partir daqui porque Composer (T25) e TakeoverBadge (T26)
// precisam de mode/assignee/windowOpen, que thread.tsx (T23) não precisa.
const CONVERSATION_LOOKUP_LIMIT = 100;

// design.md, Componente 6: página ÚNICA (não hub — CLAUDE.md reserva hub só
// para >1 destino, e o Inbox só tem um: esta própria tela). Layout split —
// fila à esquerda, thread à direita — conversa selecionada via
// `search.id` (AD-030), sem `$id` dinâmico. `useInboxSocket` conectado aqui,
// no nível da página (design.md: "primeiro hook de WS do projeto"), para que
// a conexão sobreviva à troca de thread aberta sem precisar remontar.
//
// T21 criou o esqueleto; T22 (fila), T23 (thread), T25 (composer/reenvio) e
// T26 (badge de mode/assignee/takeover/release) substituíram os placeholders
// pelos componentes reais — última task da Fase 11.
export function InboxPage() {
  const search = useSearch({ strict: false }) as InboxSearch;
  const navigate = useNavigate();
  useInboxSocket(search.id);

  const conversationLookup = useQuery({
    ...conversationsQuery({ limit: CONVERSATION_LOOKUP_LIMIT }),
    enabled: !!search.id,
  });
  const conversation = conversationLookup.data?.items.find((item) => item.id === search.id);

  const handleSelect = (id: string) => navigate({ to: '/inbox', search: { id } });

  return (
    <Card asPage>
      <CardHeader title={t('inbox.title')} />
      <CardContent className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <ConversationQueue onSelect={handleSelect} />
        <div className="flex flex-col gap-4 rounded-lg border p-4" data-testid="inbox-thread-panel">
          {!search.id ? (
            <p className="text-muted-foreground text-sm">{t('inbox.thread.select_hint')}</p>
          ) : !conversation ? (
            conversationLookup.isLoading ? null : (
              <p className="text-muted-foreground text-sm">{t('inbox.thread.not_found')}</p>
            )
          ) : (
            <>
              <TakeoverBadge conversation={conversation} />
              <ConversationThread
                conversationId={conversation.id}
                renderFailedAction={(message) => (
                  <ResendButton conversationId={conversation.id} messageId={message.id} />
                )}
              />
              <Composer conversation={conversation} />
            </>
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
