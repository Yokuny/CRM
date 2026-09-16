import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge.js';
import { ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item.js';
import { formatMoney } from '@/lib/helpers/money.helper.js';
import { t } from '@/lib/helpers/translate.helper.js';

export type KanbanCardContentProps = {
  title: string;
  description?: string;
  customerName?: string;
  processStage?: string;
  processTemplateName?: string;
  orderTotalPrice?: number;
  orderStatus?: string;
  assigneeName?: string;
  // T20: atalho "editar" do details.tsx entra aqui — mesmo slot deliberado
  // de customer-kanban-card-content.tsx (WEB-10), pro chamador nunca
  // precisar reestruturar este componente pra acomodar uma ação clicável
  // dentro de um card arrastável (precisa de stopPropagation em
  // onMouseDown/onTouchStart — os sensors do KanbanProvider — pra não ser
  // interpretado como início de um drag pelo dnd-kit).
  actions?: ReactNode;
};

// spec.md P2 "Card exibe as entidades vinculadas" (KAN-24..28): cada
// referência opcional vira um badge só quando presente — card 100% livre
// (sem nenhuma) mostra só título/descrição, sem seção vazia (KAN-28).
// Composição própria (não <Item>) porque o container do KanbanCard é uma
// <div>, não <ul> — mesmo cuidado de customer-kanban-card-content.tsx (o
// componente equivalente do kanban de Customer, feature 4).
export function KanbanCardContent({
  title,
  description,
  customerName,
  processStage,
  processTemplateName,
  orderTotalPrice,
  orderStatus,
  assigneeName,
  actions,
}: KanbanCardContentProps) {
  const hasAnyReference = Boolean(customerName || processStage || orderStatus || assigneeName);

  return (
    <div className="flex flex-col gap-2 px-3 py-2.5">
      <ItemContent className="gap-1">
        <ItemTitle>{title}</ItemTitle>
        {description && <ItemDescription>{description}</ItemDescription>}
        {actions}
      </ItemContent>
      {hasAnyReference && (
        <div className="flex flex-wrap gap-1">
          {/* KAN-24: nome do cliente. */}
          {customerName && (
            <Badge variant="outline" title={t('kanban.card.field.customer')}>
              {customerName}
            </Badge>
          )}
          {/* KAN-25: identificador amigável do processo (nome do template +
              estágio atual). */}
          {processStage && (
            <Badge variant="secondary" title={t('kanban.card.field.process')}>
              {processTemplateName ? `${processTemplateName} · ${processStage}` : processStage}
            </Badge>
          )}
          {/* KAN-26: identificador amigável do pedido (valor total + status). */}
          {orderStatus && (
            <Badge variant="outline" title={t('kanban.card.field.order')}>
              {formatMoney(orderTotalPrice)} · {t(`order.status.${orderStatus}`)}
            </Badge>
          )}
          {/* KAN-27: nome do usuário responsável. */}
          {assigneeName && (
            <Badge variant="muted" title={t('kanban.card.field.assignee')}>
              {assigneeName}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
