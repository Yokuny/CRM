import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { post } from '@/lib/api/client.api.js';
import { t } from '@/lib/helpers/translate.helper.js';
import {
  type ConversationMode,
  type ConversationRecord,
  type ConversationsListResult,
  conversationKeys,
} from '@/query/conversation.js';
import { sessionQuery } from '@/query/session.js';

type TakeoverBadgeProps = { conversation: ConversationRecord };

// Resposta de POST /:id/takeover|release (conversation.controller.ts) —
// espelha o `ConversationRecord` do REPOSITORY (tenant/channel/customer/
// mode/assignee/windowExpiresAt/lastActivityAt), um shape DIFERENTE do
// `ConversationRecord` deste front (query/conversation.ts, que espelha
// `ConversationListItem`, com unread/windowOpen). Só os 2 campos usados
// aqui (mode/assignee) são declarados — o resto da resposta é ignorado.
type TakeoverResponse = { mode: ConversationMode; assignee?: string };

// INBOX-08/09/10 (design.md Componente 6, context.md decisão #6): badge de
// mode + assignee, com "Assumir"/"Liberar" chamando os endpoints já
// existentes (T11/T12). "Assumir" atualiza o badge sem refresh manual
// porque a própria resposta da mutação já traz mode/assignee atualizados —
// grava direto no cache de QUALQUER conversationsQuery já carregada (mesma
// técnica de useInboxSocket.ts/applyConversationUpdated), nunca um segundo
// estado global (CLAUDE.md).
export function TakeoverBadge({ conversation }: TakeoverBadgeProps) {
  const queryClient = useQueryClient();
  const sessionQueryResult = useQuery(sessionQuery);
  const selfId = sessionQueryResult.data?.user.id;

  const applyUpdate = (updated: TakeoverResponse) => {
    queryClient.setQueriesData<ConversationsListResult>({ queryKey: conversationKeys.lists() }, (old) =>
      old
        ? {
            ...old,
            items: old.items.map((item) =>
              item.id === conversation.id ? { ...item, mode: updated.mode, assignee: updated.assignee } : item,
            ),
          }
        : old,
    );
  };

  const takeoverMutation = useMutation({
    mutationFn: async (): Promise<TakeoverResponse> => {
      const res = await post<TakeoverResponse>(`/conversations/${encodeURIComponent(conversation.id)}/takeover`);
      // INBOX-08/AC3: 409 nomeando o assignee atual já vem pronto em
      // `res.message` (conversation.service.ts: ConversationAlreadyAssignedError
      // resolve o User.name no back-end) — o toast repassa essa mensagem tal
      // como veio, sem reconstruir o texto no front.
      if (!res.success || !res.data) throw new Error(res.message ?? t('inbox.takeover.error'));
      return res.data;
    },
    onSuccess: applyUpdate,
    onError: (error: Error) => toast.error(error.message),
  });

  const releaseMutation = useMutation({
    mutationFn: async (): Promise<TakeoverResponse> => {
      const res = await post<TakeoverResponse>(`/conversations/${encodeURIComponent(conversation.id)}/release`);
      if (!res.success || !res.data) throw new Error(res.message ?? t('inbox.release.error'));
      return res.data;
    },
    onSuccess: applyUpdate,
    onError: (error: Error) => toast.error(error.message),
  });

  // SPEC_DEVIATION (mesma nota de conversation-queue.tsx): `assignee` só
  // chega como ObjectId — sem diretório de usuários exposto ao apps/web
  // (fora do "Where" desta fase), "Você"/"Outro operador" é a aproximação
  // honesta; o nome real só aparece no toast de conflito 409 acima, onde o
  // back-end já resolve.
  const assigneeLabel =
    conversation.mode === 'human' && conversation.assignee
      ? conversation.assignee === selfId
        ? t('inbox.assignee.you')
        : t('inbox.assignee.other')
      : undefined;

  return (
    <div className="flex items-center gap-2">
      <Badge variant={conversation.mode === 'human' ? 'success' : 'secondary'}>
        {t(conversation.mode === 'human' ? 'inbox.mode.human' : 'inbox.mode.bot')}
      </Badge>
      {assigneeLabel && <span className="text-muted-foreground text-sm">{assigneeLabel}</span>}
      <Button
        type="button"
        size="sm"
        variant="basic"
        onClick={() => takeoverMutation.mutate()}
        disabled={takeoverMutation.isPending}
      >
        {t('inbox.takeover.action')}
      </Button>
      {/* INBOX-09: "Liberar" funciona pra qualquer operador (regressão) —
          incondicional, nunca checa se `selfId === conversation.assignee`. */}
      {conversation.mode === 'human' && (
        <Button
          type="button"
          size="sm"
          variant="basic"
          onClick={() => releaseMutation.mutate()}
          disabled={releaseMutation.isPending}
        >
          {t('inbox.release.action')}
        </Button>
      )}
    </div>
  );
}
