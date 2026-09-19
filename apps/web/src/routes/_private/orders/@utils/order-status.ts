import type { OrderStatus, PaymentStatus } from '@/query/order.js';

// Cor do badge por status — compartilhado pela lista (index.tsx) e pelo
// detalhe (details.tsx), pra o mesmo status nunca aparecer com duas cores.
export const ORDER_STATUS_BADGE_VARIANT: Record<OrderStatus, 'warning' | 'success' | 'error'> = {
  pending_approval: 'warning',
  confirmed: 'success',
  rejected: 'error',
  payment_expired: 'error',
};

// spec.md P2 AC1 (PAY-15/T31): só 3 valores têm estilo semântico próprio no
// texto literal da AC (pending/paid/expired); refunded/canceled (Out of Scope:
// sem handling automático, spec.md) caem num fallback neutro em vez de
// quebrar/sumir.
export const PAYMENT_STATUS_BADGE_VARIANT: Record<PaymentStatus, 'warning' | 'success' | 'error' | 'neutral'> = {
  pending: 'warning',
  paid: 'success',
  expired: 'error',
  refunded: 'neutral',
  canceled: 'neutral',
};
