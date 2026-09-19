import type { FieldTemplateTargetType } from '@crm/contracts';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { DefaultEmptyData } from '@/components/default-empty-data.js';
import { DefaultLoading } from '@/components/default-loading.js';
import { BadgeIndicator } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardHeader } from '@/components/ui/card.js';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item.js';
import { t } from '@/lib/helpers/translate.helper.js';
import { fieldTemplatesQuery, type TemplateListItem } from '@/query/fieldTemplate.js';

function TemplateList({ targetType, items }: { targetType: FieldTemplateTargetType; items: TemplateListItem[] }) {
  if (items.length === 0) return <DefaultEmptyData />;
  return (
    <ItemGroup>
      {items.map((template) => (
        <Item
          key={template.key}
          render={
            <Link to="/custom_fields/details" search={{ targetType, key: template.key }}>
              <ItemContent>
                <ItemTitle>{template.label}</ItemTitle>
              </ItemContent>
              {template.archived && <BadgeIndicator variant="muted">{t('archived')}</BadgeIndicator>}
            </Link>
          }
        />
      ))}
    </ItemGroup>
  );
}

// Só admin (layout _admin). Um template de cliente por tenant (nasce com o
// tenant) e N tipos de processo — cada um abre em details.tsx, que mostra e
// versiona os campos.
export function CustomFieldsIndexPage() {
  const customerTemplates = useQuery(fieldTemplatesQuery('customer'));
  const processTemplates = useQuery(fieldTemplatesQuery('process'));

  return (
    <Card asPage>
      <CardHeader title={t('custom_fields')}>
        <CardAction>
          <Button variant="basic" render={<Link to="/custom_fields/add">{t('new_process_type')}</Link>} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <ItemDescription>{t('define_extra_fields')}</ItemDescription>
        {customerTemplates.isLoading || processTemplates.isLoading ? (
          <DefaultLoading />
        ) : (
          <div className="grid gap-6">
            <div className="grid gap-2">
              <ItemTitle>{t('customers')}</ItemTitle>
              <TemplateList targetType="customer" items={customerTemplates.data?.items ?? []} />
            </div>
            <div className="grid gap-2">
              <ItemTitle>{t('processes')}</ItemTitle>
              <TemplateList targetType="process" items={processTemplates.data?.items ?? []} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute('/_private/_admin/custom_fields/')({
  component: CustomFieldsIndexPage,
  staticData: { title: t('custom_fields') },
});
