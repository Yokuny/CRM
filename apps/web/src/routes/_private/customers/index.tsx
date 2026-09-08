import { createFileRoute, Link } from '@tanstack/react-router';
import { Kanban, List, Plus } from 'lucide-react';
import type { ComponentType } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card.js';
import { Item, ItemContent, ItemMedia, ItemTitle } from '@/components/ui/item.js';
import { t } from '@/lib/helpers/translate.helper.js';

type CustomersSection = { to: string; titleKey: string; icon: ComponentType<{ className?: string }> };

// Hub de navegação (mesmo padrão de settings/index.tsx de referência): index
// de uma seção com mais de um destino real vira um menu de cards, nunca um
// redirect automático — o usuário escolhe pra onde ir.
const CUSTOMERS_SECTIONS: CustomersSection[] = [
  { to: '/customers/list', titleKey: 'customers.list.title', icon: List },
  { to: '/customers/kanban', titleKey: 'customers.view.kanban', icon: Kanban },
  { to: '/customers/add', titleKey: 'customer.create.title', icon: Plus },
];

export function CustomersIndexPage() {
  return (
    <Card asPage>
      <CardHeader />
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {CUSTOMERS_SECTIONS.map(({ to, titleKey, icon: Icon }) => (
          <Item key={to} variant="outline" asChild>
            <Link to={to}>
              <ItemMedia variant="icon">
                <Icon className="size-4" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{t(titleKey)}</ItemTitle>
              </ItemContent>
            </Link>
          </Item>
        ))}
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute('/_private/customers/')({
  component: CustomersIndexPage,
  staticData: { title: t('customers') },
});
