import { useMutation, useQueryClient } from '@tanstack/react-query';
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

type TakeoverBadgeProps = { conversation: ConversationRecord };

// Resposta de POST /:id/takeover|release (conversation.controller.ts) —
// espelha o `ConversationRecord` do REPOSITORY (tenant/channel/customer/
// mode/assignee/assigneeName/windowExpiresAt/lastActivityAt), um shape
// DIFERENTE do `ConversationRecord` deste front (query/conversation.ts, que
// espelha `ConversationListItem`, com unread/windowOpen). Só os campos
// usados aqui (mode/assignee/assigneeName) são declarados — o resto da
// resposta é ignorado.
type TakeoverResponse = { mode: ConversationMode; assignee?: string; assigneeName?: string };

// INBOX-08/09/10 (design.md Componente 6, context.md decisão #6): badge de
// mode + assignee, com "Assumir"/"Liberar" chamando os endpoints já
// existentes (T11/T12). "Assumir" atualiza o badge sem refresh manual
// porque a própria resposta da mutação já traz mode/assignee atualizados —
// grava direto no cache de QUALQUER conversationsQuery já carregada (mesma
// técnica de useInboxSocket.ts/applyConversationUpdated), nunca um segundo
// estado global (CLAUDE.md).
export function TakeoverBadge({ conversation }: TakeoverBadgeProps) {
  const queryClient = useQueryClient();

  const applyUpdate = (updated: TakeoverResponse) => {
    queryClient.setQueriesData<ConversationsListResult>({ queryKey: conversationKeys.lists() }, (old) =>
      old
        ? {
            ...old,
            items: old.items.map((item) =>
              item.id === conversation.id
                ? { ...item, mode: updated.mode, assignee: updated.assignee, assigneeName: updated.assigneeName }
                : item,
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

  // INBOX-10/AC5 (Fix 1, validation.md): `assigneeName` já vem resolvido do
  // back-end (mesma resposta de takeover/release e de GET /conversations,
  // conversation.service.ts) — spec.md pede literalmente "o nome do
  // assignee" quando mode:'human', mostrado direto, sem distinção "é
  // você"/"é outro operador".
  const assigneeLabel = conversation.mode === 'human' ? conversation.assigneeName : undefined;

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
