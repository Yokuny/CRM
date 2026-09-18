import { createFileRoute, Link } from '@tanstack/react-router';
import { Kanban, List, Plus } from 'lucide-react';
import type { ComponentType } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card.js';
import { Item, ItemContent, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item.js';
import { t } from '@/lib/helpers/translate.helper.js';

type CustomersSection = { to: string; titleKey: string; icon: ComponentType<{ className?: string }> };

// Hub de navegação (mesmo padrão de settings/index.tsx de referência): index
// de uma seção com mais de um destino real vira um menu de cards, nunca um
// redirect automático — o usuário escolhe pra onde ir.
const CUSTOMERS_SECTIONS: CustomersSection[] = [
  { to: '/customers/list', titleKey: 'list', icon: List },
  { to: '/customers/kanban', titleKey: 'kanban', icon: Kanban },
  { to: '/customers/add', titleKey: 'new_customer', icon: Plus },
];

export function CustomersIndexPage() {
  return (
    <Card asPage>
      <CardHeader />
      <CardContent>
        <ItemGroup variant="grid">
          {CUSTOMERS_SECTIONS.map(({ to, titleKey, icon: Icon }) => (
            <Item
              className="md:p-6 py-4"
              key={to}
              render={
                <Link to={to}>
                  <ItemMedia variant="icon">
                    <Icon className="size-4" />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{t(titleKey)}</ItemTitle>
                  </ItemContent>
                </Link>
              }
            />
          ))}
        </ItemGroup>
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute('/_private/customers/')({
  component: CustomersIndexPage,
  staticData: { title: t('customers') },
});
