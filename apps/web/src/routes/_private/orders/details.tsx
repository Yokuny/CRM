import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useSearch } from '@tanstack/react-router';
import { type ReactNode, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { DefaultEmptyData } from '@/components/default-empty-data.js';
import { DefaultLoading } from '@/components/default-loading.js';
import { BadgeIndicator } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardHeader } from '@/components/ui/card.js';
import { Input } from '@/components/ui/input.js';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle, Panel } from '@/components/ui/item.js';
import { Label } from '@/components/ui/label.js';
import { formatDateTime } from '@/lib/helpers/formatDate.helper.js';
import { formatMoney } from '@/lib/helpers/money.helper.js';
import { t } from '@/lib/helpers/translate.helper.js';
import {
  approveOrderMutation,
  type OrderDetailRecord,
  type OrderPaymentRecord,
  orderQuery,
  rejectOrderMutation,
} from '@/query/order.js';
import { OrderItemsTable } from './@components/order-items-table.js';
import { ORDER_STATUS_BADGE_VARIANT, PAYMENT_STATUS_BADGE_VARIANT } from './@utils/order-status.js';

// AD-030: `search: { id }`, nunca um `$id` path segment.
export const orderDetailsSearchSchema = z.object({ id: z.string().min(1) });
export type OrderDetailsSearch = z.infer<typeof orderDetailsSearchSchema>;

// "Nome · data" de quem aprovou/rejeitou — o nome pode faltar (usuário
// removido), a data sempre existe quando o campo existe.
const actorLine = (name: string | undefined, at: string | undefined): string =>
  [name ?? '-', at ? formatDateTime(at) : undefined].filter(Boolean).join(' · ');

function InfoRow({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Item>
      <ItemContent>
        <ItemTitle>{title}</ItemTitle>
        <ItemDescription>{children}</ItemDescription>
      </ItemContent>
    </Item>
  );
}

function OrderInfo({ order }: { order: OrderDetailRecord }) {
  return (
    <ItemGroup>
      {/* O cliente abre o próprio cadastro; sem nome (cliente removido) vira
          linha simples, sem link pra um detalhe que não existe mais. */}
      {order.customerName ? (
        <Item
          render={
            <Link to="/customers/details" search={{ id: order.customer }}>
              <ItemContent>
                <ItemTitle>{t('customer')}</ItemTitle>
                <ItemDescription>{order.customerName}</ItemDescription>
                {order.customerPhone && <ItemDescription>{order.customerPhone}</ItemDescription>}
              </ItemContent>
            </Link>
          }
        />
      ) : (
        <InfoRow title={t('customer')}>-</InfoRow>
      )}
      <InfoRow title={t('status')}>
        <BadgeIndicator variant={ORDER_STATUS_BADGE_VARIANT[order.status]}>{t(order.status)}</BadgeIndicator>
      </InfoRow>
      <InfoRow title={t('created_at')}>{formatDateTime(order.createdAt)}</InfoRow>
      <InfoRow title={t('customer_confirmed')}>{t(order.customerConfirmed ? 'yes' : 'no')}</InfoRow>
      <InfoRow title={t('approved_by_team')}>
        {order.operatorApproved ? actorLine(order.approvedByName, order.approvedAt) : t('no')}
      </InfoRow>
      {order.status === 'rejected' && (
        <InfoRow title={t('rejected_by')}>{actorLine(order.rejectedByName, order.rejectedAt)}</InfoRow>
      )}
      {order.rejectionReason && <InfoRow title={t('reason')}>{order.rejectionReason}</InfoRow>}
      {/* Aprovação que não conseguiu confirmar (ex.: estoque) — o pedido
          segue pendente e o motivo vem pronto do back-end. */}
      {order.confirmFailureReason && <InfoRow title={t('pending_issue')}>{order.confirmFailureReason}</InfoRow>}
    </ItemGroup>
  );
}

function OrderPayment({ payment }: { payment: OrderPaymentRecord }) {
  const pixPayload = payment.pixPayload;

  // Copia-e-cola pra reenviar ao cliente enquanto a cobrança está aberta.
  const handleCopy = async () => {
    if (!pixPayload) return;
    try {
      await navigator.clipboard.writeText(pixPayload);
      toast.success(t('copied'));
    } catch {
      toast.error(t('action_error'));
    }
  };

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <ItemTitle>{t('payment')}</ItemTitle>
        {payment.status === 'pending' && pixPayload && (
          <Button type="button" variant="basic" onClick={handleCopy}>
            {t('copy_pix_code')}
          </Button>
        )}
      </div>
      <ItemGroup>
        <InfoRow title={t('status')}>
          <BadgeIndicator variant={PAYMENT_STATUS_BADGE_VARIANT[payment.status]}>{t(payment.status)}</BadgeIndicator>
        </InfoRow>
        <InfoRow title={t('total')}>{formatMoney(payment.value)}</InfoRow>
        <InfoRow title={t('payment_method')}>{payment.billingType}</InfoRow>
        <InfoRow title={t('created_at')}>{formatDateTime(payment.createdAt)}</InfoRow>
      </ItemGroup>
    </div>
  );
}

// Rejeitar é terminal: confirmação inline com o motivo opcional que
// rejectOrderSchema aceita (a lista rejeita sem motivo, num clique).
function RejectOrderPanel({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const mutation = useMutation(rejectOrderMutation(queryClient));

  const handleReject = () => {
    if (mutation.isPending) return;
    mutation.mutate(
      { id: orderId, reason: reason.trim() || undefined },
      { onSuccess: onDone, onError: (error: Error) => toast.error(error.message) },
    );
  };

  return (
    <Panel className="grid gap-3" data-testid="reject-order">
      <ItemDescription>{t('reject_order_warning')}</ItemDescription>
      <div className="grid gap-2">
        <Label htmlFor="reject-reason">{t('reason')}</Label>
        <Input
          id="reject-reason"
          placeholder={t('example_rejection_reason')}
          value={reason}
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="destructive" disabled={mutation.isPending} onClick={handleReject}>
          {t('reject')}
        </Button>
        <Button type="button" variant="basic" disabled={mutation.isPending} onClick={onDone}>
          {t('cancel')}
        </Button>
      </div>
    </Panel>
  );
}

// Detalhe de um pedido: dados, itens com o preço da compra, pagamento e as
// mesmas ações da fila (aprovar/rejeitar, só enquanto pendente) — as
// mutações invalidam lista E detalhe (orderKeys.all), então o status muda
// aqui sem recarregar.
export function OrderDetailsPage() {
  const search = useSearch({ strict: false }) as OrderDetailsSearch;
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const query = useQuery(orderQuery(search.id));
  const approveMutation = useMutation(approveOrderMutation(queryClient));
  const order = query.data;
  const isPending = order?.status === 'pending_approval';

  const handleApprove = () => {
    if (!order || approveMutation.isPending) return;
    approveMutation.mutate({ id: order.id }, { onError: (error: Error) => toast.error(error.message) });
  };

  return (
    <Card asPage>
      <CardHeader title={t('order')}>
        {order && (
          <CardAction className="flex gap-2">
            <Button
              variant="basic"
              render={
                <Link to="/inbox" search={{ id: order.conversation }}>
                  {t('open_conversation')}
                </Link>
              }
            />
            {isPending && !rejecting && (
              <>
                <Button type="button" variant="success" disabled={approveMutation.isPending} onClick={handleApprove}>
                  {t('approve')}
                </Button>
                <Button type="button" variant="destructive" onClick={() => setRejecting(true)}>
                  {t('reject')}
                </Button>
              </>
            )}
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <DefaultLoading />
        ) : !order ? (
          <DefaultEmptyData />
        ) : (
          <div className="grid gap-6">
            {rejecting && isPending && <RejectOrderPanel orderId={order.id} onDone={() => setRejecting(false)} />}
            <OrderInfo order={order} />
            <div className="grid gap-2">
              <ItemTitle>{t('items')}</ItemTitle>
              <OrderItemsTable items={order.items} totalPrice={order.totalPrice} />
            </div>
            {order.payment && <OrderPayment payment={order.payment} />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute('/_private/orders/details')({
  component: OrderDetailsPage,
  staticData: { title: t('details') },
  validateSearch: (search: Record<string, unknown>): OrderDetailsSearch => orderDetailsSearchSchema.parse(search),
});
