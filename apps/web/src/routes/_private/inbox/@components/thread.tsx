import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { DefaultLoading } from '@/components/default-loading.js';
import { Badge } from '@/components/ui/badge.js';
import { formatDate } from '@/lib/helpers/formatDate.helper.js';
import { t } from '@/lib/helpers/translate.helper.js';
import { cn } from '@/lib/utils.js';
import { type MessageRecord, messagesQuery } from '@/query/message.js';
import { MediaCard } from './media-card.js';

// Limite único, sem "carregar mais": T23's Done-when só pede histórico
// paginado renderizado em ordem cronológica (a paginação em si já é
// server-side, T9/T10) — 100 é o MAX_PAGE_SIZE do back-end
// (conversation.service.ts), cobre confortavelmente o volume esperado de
// uma conversa de atendimento sem inventar uma UI de "carregar mais" que
// nenhum Done-when desta task pede.
const MESSAGE_LIMIT = 100;

// INBOX-17/18: texto e template renderizam inline; image/document delegam
// pro <MediaCard> (T24) — fetch sob demanda, nunca automático ao renderizar
// a thread.
function renderMessageBody(message: MessageRecord, conversationId: string): ReactNode {
  if (message.text !== undefined) return <p className="text-sm">{message.text}</p>;
  if (message.templateName !== undefined) {
    return (
      <div>
        <p className="font-medium text-sm">{message.templateName}</p>
        {message.templateParams && Object.keys(message.templateParams).length > 0 && (
          <p className="text-muted-foreground text-xs">{JSON.stringify(message.templateParams)}</p>
        )}
      </div>
    );
  }
  if (message.type === 'image' || message.type === 'document') {
    return <MediaCard conversationId={conversationId} message={message} />;
  }
  return <p className="text-muted-foreground text-sm italic">{t('inbox.message.unsupported')}</p>;
}

type ThreadProps = {
  conversationId: string;
  // T25 (composer.tsx) injeta o botão de reenvio aqui via callback — thread
  // continua sem importar composer.tsx (acoplamento só no ponto de uso,
  // index.tsx), e é opcional para que este componente/teste continue
  // funcionando isolado antes de T25 existir.
  renderFailedAction?: (message: MessageRecord) => ReactNode;
};

// INBOX-05/06/07/10/15 (design.md Componente 6): lista `messagesQuery` (T19)
// em ordem cronológica (o back-end já ordena por createdAt asc, T9). Uma
// `Message failed` NUNCA some/substitui após reenvio — o documento original
// permanece na lista (a nova tentativa entra como um item novo, mais abaixo,
// via createdAt mais recente — INBOX-15). Atualização ao vivo vem do
// useInboxSocket (T20/T21, montado no nível da página): ele já escreve
// direto no cache de `messageKeys.listsForConversation(conversationId)`
// (prefixo que casa com a query abaixo independente do `limit`), então uma
// `message.new` aparece aqui sem nenhum refetch — nenhum código extra
// necessário neste componente para isso.
export function ConversationThread({ conversationId, renderFailedAction }: ThreadProps) {
  const query = useQuery(messagesQuery(conversationId, { limit: MESSAGE_LIMIT }));

  if (query.isLoading) return <DefaultLoading />;

  const items = query.data?.items ?? [];
  if (items.length === 0) return <p className="text-muted-foreground text-sm">{t('inbox.thread.empty')}</p>;

  return (
    <div className="flex flex-col gap-2">
      {items.map((message) => (
        <div
          key={message.id}
          className={cn('max-w-[80%] rounded-md border p-2', message.direction === 'out' ? 'ml-auto' : 'mr-auto')}
        >
          {renderMessageBody(message, conversationId)}
          <p className="text-muted-foreground text-xs">{formatDate(message.createdAt, 'dd/MM HH:mm')}</p>
          {message.status === 'failed' && (
            <div className="mt-1 flex items-center gap-2">
              <Badge variant="error">{t('inbox.message.failed')}</Badge>
              {renderFailedAction?.(message)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
