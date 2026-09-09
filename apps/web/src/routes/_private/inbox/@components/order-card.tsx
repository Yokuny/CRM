import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { formatMoney } from '@/lib/helpers/money.helper.js';
import { t } from '@/lib/helpers/translate.helper.js';
import { approveOrderMutation, ordersQuery, rejectOrderMutation } from '@/query/order.js';

type OrderCardProps = { conversationId: string };

// spec.md P1 "Operador aprova ou rejeita um pedido pendente"/AC3 (design.md
// Componente "Telas apps/web", context.md decisão 5): card inline mostrando
// o Order pending_approval desta Conversation específica, com
// Aprovar/Rejeitar — mesmo padrão visual/estrutural de takeover-badge.tsx.
// approveOrderMutation/rejectOrderMutation (T22) invalidam orderKeys.lists()
// (o MESMO prefixo de queryKey usado por esta query), então aprovar/
// rejeitar aqui — ou na tela de Pedidos, T23 — faz este card sumir sem
// refresh manual, em qualquer uma das duas superfícies.
export function OrderCard({ conversationId }: OrderCardProps) {
  const queryClient = useQueryClient();
  const query = useQuery(ordersQuery({ conversation: conversationId, status: 'pending_approval', limit: 1 }));

  const approveMutation = useMutation(approveOrderMutation(queryClient));
  const rejectMutation = useMutation(rejectOrderMutation(queryClient));

  const order = query.data?.items[0];
  // T24 Done-when: nenhum Order pendente para esta Conversation -> não
  // renderiza nada (sem estado vazio ruidoso) — inclusive durante o
  // carregamento, pra evitar um flash de UI vazia neste widget secundário
  // dentro da thread.
  if (!order) return null;

  const handleApprove = () => {
    approveMutation.mutate({ id: order.id }, { onError: (error: Error) => toast.error(error.message) });
  };
  const handleReject = () => {
    rejectMutation.mutate({ id: order.id }, { onError: (error: Error) => toast.error(error.message) });
  };

  return (
    <div className="flex items-center gap-2 rounded-md border p-2">
      <Badge variant="warning">{t('order.status.pending_approval')}</Badge>
      <span className="text-sm">{formatMoney(order.totalPrice)}</span>
      <Button type="button" size="sm" variant="success" onClick={handleApprove} disabled={approveMutation.isPending}>
        {t('order.approve.action')}
      </Button>
      <Button type="button" size="sm" variant="destructive" onClick={handleReject} disabled={rejectMutation.isPending}>
        {t('order.reject.action')}
      </Button>
    </div>
  );
}
