import { FileText, Image as ImageIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button.js';
import { t } from '@/lib/helpers/translate.helper.js';
import { type MessageRecord, mediaUrl } from '@/query/message.js';

type MediaCardProps = { conversationId: string; message: MessageRecord };

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; objectUrl: string }
  | { status: 'error'; message: string };

// INBOX-17/18 (design.md Componente 4/5): card por mensagem image|document —
// ícone por tipo + mime + caption, SEM nenhuma chamada automática à Meta ao
// renderizar (spec.md P2/AC1). O binário só é buscado sob demanda, no clique
// do botão "Ver"/"Baixar" (mediaUrl, T19, aponta pra rota de proxy do T17) —
// nunca persistido, só um object URL local que vive enquanto o componente
// estiver montado.
export function MediaCard({ conversationId, message }: MediaCardProps) {
  const [state, setState] = useState<LoadState>({ status: 'idle' });
  const isImage = message.type === 'image';
  const Icon = isImage ? ImageIcon : FileText;

  const handleFetch = async () => {
    setState({ status: 'loading' });
    try {
      const res = await fetch(mediaUrl(conversationId, message.id), { credentials: 'include' });
      if (!res.ok) {
        const body = (await res.json().catch(() => undefined)) as { message?: string } | undefined;
        setState({ status: 'error', message: body?.message ?? t('inbox.media.error') });
        return;
      }
      const blob = await res.blob();
      setState({ status: 'loaded', objectUrl: URL.createObjectURL(blob) });
    } catch {
      setState({ status: 'error', message: t('inbox.media.error') });
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border p-2">
      <div className="flex items-center gap-2">
        <Icon className="size-4 shrink-0" />
        <span className="text-muted-foreground text-xs">{message.media?.mime ?? message.type}</span>
      </div>
      {message.media?.caption && <p className="text-sm">{message.media.caption}</p>}

      {state.status === 'idle' && (
        <Button type="button" size="sm" variant="basic" onClick={handleFetch}>
          {isImage ? t('inbox.media.view') : t('inbox.media.download')}
        </Button>
      )}
      {state.status === 'loading' && <p className="text-muted-foreground text-xs">{t('inbox.media.loading')}</p>}
      {state.status === 'error' && <p className="text-destructive text-xs">{state.message}</p>}
      {state.status === 'loaded' &&
        (isImage ? (
          <img src={state.objectUrl} alt={message.media?.caption ?? ''} className="max-h-64 rounded-md" />
        ) : (
          <a href={state.objectUrl} download className="text-sm underline">
            {t('inbox.media.download')}
          </a>
        ))}
    </div>
  );
}
