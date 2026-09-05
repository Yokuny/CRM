import type { ReactNode } from 'react';
import { ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item.js';

export type CustomerKanbanCardContentProps = {
  name: string;
  phone: string;
  // Slot deliberado para WEB-10 (T25, próxima batch): o atalho "novo
  // Process" a partir do card do kanban entra aqui, sem precisar
  // reestruturar este componente para acomodá-lo.
  actions?: ReactNode;
};

export function CustomerKanbanCardContent({ name, phone, actions }: CustomerKanbanCardContentProps) {
  return (
    <ItemContent className="gap-1 px-3 py-2.5">
      <ItemTitle>{name}</ItemTitle>
      <ItemDescription>{phone}</ItemDescription>
      {actions}
    </ItemContent>
  );
}
