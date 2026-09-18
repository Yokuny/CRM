import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Panel } from '@/components/ui/item.js';
import { post } from '@/lib/api/client.api.js';
import { t } from '@/lib/helpers/translate.helper.js';
import type { ConversationRecord } from '@/query/conversation.js';
import { customerQuery } from '@/query/customer.js';
import { type MessageRecord, messageKeys, resendMessage } from '@/query/message.js';

type ComposerProps = { conversation: ConversationRecord };

// INBOX-11/12/13 (design.md Componente 6, context.md decisão #4): janela de
// 24h aberta (`conversation.windowOpen`, já computado pelo back-end,
// T7/listConversations — nenhuma conta de data feita aqui) habilita texto
// livre via `POST /:id/messages` (endpoint já existente). Janela fechada
// desabilita o texto e mostra só o botão "Abrir no WhatsApp" — link
// `wa.me/<telefone>` (sem dígitos removidos: spec.md Edge Cases, "o botão
// SHALL usar o valor como está armazenado"), nova aba, NENHUMA chamada de
// envio pela plataforma nesse caminho.
export function Composer({ conversation }: ComposerProps) {
  const [text, setText] = useState('');
  const queryClient = useQueryClient();
  const customerQueryResult = useQuery(customerQuery(conversation.customer));

  const sendMutation = useMutation({
    mutationFn: async (value: string) => {
      const res = await post<MessageRecord>(`/conversations/${encodeURIComponent(conversation.id)}/messages`, {
        text: value,
      });
      if (!res.success || !res.data) throw new Error(res.message ?? t('send_error'));
      return res.data;
    },
    onSuccess: () => {
      setText('');
      queryClient.invalidateQueries({ queryKey: messageKeys.listsForConversation(conversation.id) });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const handleSend = () => {
    if (!text.trim() || sendMutation.isPending) return;
    sendMutation.mutate(text);
  };

  if (!conversation.windowOpen) {
    const phone = customerQueryResult.data?.phone;
    return (
      <Panel size="sm" className="flex-row items-center justify-between">
        <p className="text-muted-foreground text-sm">{t('whatsapp_window_closed')}</p>
        {/* `disabled` não é um atributo HTML válido em <a> — sem `phone`
            (customerQuery ainda carregando) o link simplesmente não tem
            `href`, o que já o torna não-navegável, sem precisar de um
            estado "desabilitado" que <a> não suporta nativamente. */}
        <Button
          variant="basic"
          render={
            <a href={phone ? `https://wa.me/${phone}` : undefined} target="_blank" rel="noreferrer">
              {t('open_in_whatsapp')}
            </a>
          }
        />
      </Panel>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('write_message')}
        disabled={sendMutation.isPending}
      />
      <Button type="button" onClick={handleSend} disabled={sendMutation.isPending}>
        {t('send')}
      </Button>
    </div>
  );
}

type ResendButtonProps = { conversationId: string; messageId: string };

// INBOX-14/15/16: reenvia uma Message failed (resendMessage, T19) — clona um
// documento novo `status:'queued'`, nunca modifica o original (o selo
// "Falhou" continua visível na thread, T23, por conta própria — nenhuma
// coordenação extra necessária aqui). Encaixado na thread via
// `renderFailedAction` (index.tsx), não importado por thread.tsx diretamente.
export function ResendButton({ conversationId, messageId }: ResendButtonProps) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => resendMessage(queryClient, conversationId, messageId),
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Button type="button" variant="basic" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
      {t('resend')}
    </Button>
  );
}
