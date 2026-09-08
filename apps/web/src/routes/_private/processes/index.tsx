import { createFileRoute, Link } from '@tanstack/react-router';
import { Users } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card.js';
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item.js';
import { t } from '@/lib/helpers/translate.helper.js';

// Hub de navegação (mesmo padrão de settings/index.tsx de referência e de
// customers/index.tsx). Process não tem destino genérico próprio — todo
// processo pertence a um cliente (customerId obrigatório em /processes/add e
// /processes/details), então o único card daqui aponta de volta pra
// Clientes, com uma descrição explicando o porquê de só ter uma opção.
export function ProcessesIndexPage() {
  return (
    <Card asPage>
      <CardHeader title={t('customer.processes.title')} />
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Item variant="outline" asChild>
          <Link to="/customers">
            <ItemMedia variant="icon">
              <Users className="size-4" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{t('customers')}</ItemTitle>
              <ItemDescription>{t('process.index.hint')}</ItemDescription>
            </ItemContent>
          </Link>
        </Item>
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute('/_private/processes/')({
  component: ProcessesIndexPage,
  staticData: { title: t('customer.processes.title') },
});
