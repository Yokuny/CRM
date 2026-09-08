import type { ReactNode } from 'react';
import { ItemContent, ItemDescription, ItemFooter, ItemMedia, ItemTitle } from '@/components/ui/item.js';
import { formatDistanceToNow } from '@/lib/helpers/formatDate.helper.js';

export type CustomerKanbanCardContentProps = {
  name: string;
  phone: string;
  createdAt: string;
  // Slot deliberado para WEB-10 (T25, próxima batch): o atalho "novo
  // Process" a partir do card do kanban entra aqui, sem precisar
  // reestruturar este componente para acomodá-lo.
  actions?: ReactNode;
};

// Iniciais do nome (primeira letra do primeiro + último token) pro avatar
// textual do card — o projeto não tem componente Avatar próprio, ItemMedia
// variant="icon" já cobre o círculo com um ícone/texto pequeno dentro.
const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
};

// Composição própria (não <Item>) porque o container do KanbanCard é uma
// <div>, não <ul> — <Item> renderiza <li> por padrão, e um <li> solto fora
// de <ul>/<ol> seria HTML semanticamente inválido aqui.
export function CustomerKanbanCardContent({ name, phone, createdAt, actions }: CustomerKanbanCardContentProps) {
  return (
    <div className="flex flex-col gap-2 px-3 py-2.5">
      <div className="flex items-start gap-3">
        <ItemMedia variant="icon" className="rounded-full bg-accent font-medium text-xs">
          {getInitials(name)}
        </ItemMedia>
        <ItemContent className="gap-1">
          <ItemTitle>{name}</ItemTitle>
          <ItemDescription>{phone}</ItemDescription>
          {actions}
        </ItemContent>
      </div>
      <ItemFooter>
        <span className="text-muted-foreground text-xs">{formatDistanceToNow(createdAt, { addSuffix: true })}</span>
      </ItemFooter>
    </div>
  );
}
