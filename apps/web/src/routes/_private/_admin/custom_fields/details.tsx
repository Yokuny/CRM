import { FIELD_TEMPLATE_TARGET_TYPES } from '@crm/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { z } from 'zod';
import { DefaultEmptyData } from '@/components/default-empty-data.js';
import { DefaultLoading } from '@/components/default-loading.js';
import { BadgeIndicator } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardHeader } from '@/components/ui/card.js';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle, Panel } from '@/components/ui/item.js';
import { t } from '@/lib/helpers/translate.helper.js';
import {
  archiveFieldTemplateMutation,
  bumpFieldTemplateMutation,
  type CurrentFieldTemplate,
  currentFieldTemplateQuery,
} from '@/query/fieldTemplate.js';
import { TemplateFieldsForm, type TemplateSubmit } from './@components/template-fields-form.js';
import { toFieldForm } from './@utils/template-form.utils.js';

// Template achado pelo par (targetType, key) — o mesmo par da listagem; o
// `id` que bump/archive exigem vem da resposta de /current.
export const customFieldDetailsSearchSchema = z.object({
  targetType: z.enum(FIELD_TEMPLATE_TARGET_TYPES),
  key: z.string().min(1),
});
export type CustomFieldDetailsSearch = z.infer<typeof customFieldDetailsSearchSchema>;

type TemplateProps = { current: CurrentFieldTemplate; search: CustomFieldDetailsSearch };

function TemplateView({ current, search }: TemplateProps) {
  return (
    <div className="grid gap-6">
      <ItemGroup>
        <Item>
          <ItemContent>
            <ItemTitle>{t('type')}</ItemTitle>
            <ItemDescription>{t(search.targetType)}</ItemDescription>
          </ItemContent>
        </Item>
        <Item>
          <ItemContent>
            <ItemTitle>{t('version')}</ItemTitle>
            <ItemDescription>{current.template.currentVersion}</ItemDescription>
          </ItemContent>
        </Item>
        <Item>
          <ItemContent>
            <ItemTitle>{t('status')}</ItemTitle>
            <ItemDescription>
              <BadgeIndicator variant={current.template.archived ? 'muted' : 'active'}>
                {t(current.template.archived ? 'archived' : 'active')}
              </BadgeIndicator>
            </ItemDescription>
          </ItemContent>
        </Item>
      </ItemGroup>

      {current.stages && (
        <div className="grid gap-2">
          <ItemTitle>{t('stages')}</ItemTitle>
          <ItemGroup>
            {current.stages.map((stage, index) => (
              <Item key={stage}>
                <ItemContent>
                  <ItemDescription>
                    {index + 1}. {stage}
                  </ItemDescription>
                </ItemContent>
              </Item>
            ))}
          </ItemGroup>
        </div>
      )}

      <div className="grid gap-2">
        <ItemTitle>{t('fields')}</ItemTitle>
        <ItemGroup>
          {current.fields.map((field) => (
            <Item key={field.fieldId} data-testid={`field-${field.fieldId}`}>
              <ItemContent>
                <ItemTitle>{field.label}</ItemTitle>
                <ItemDescription>
                  {t(field.type)} · {t(field.required ? 'required' : 'optional')}
                </ItemDescription>
                {(field.type === 'select' || field.type === 'status') && (
                  <ItemDescription>{field.options.map((option) => option.label).join(', ')}</ItemDescription>
                )}
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      </div>
    </div>
  );
}

// Editar = gerar a próxima versão (bump) a partir da atual; `expectedVersion`
// é a trava otimista — se outro admin salvou antes, o back-end responde
// outdated_version e a mensagem aparece aqui.
function TemplateEdit({ current, search, onDone }: TemplateProps & { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const mutation = useMutation(bumpFieldTemplateMutation(queryClient));

  const handleSubmit = ({ fields, stages, migration }: TemplateSubmit) => {
    if (mutation.isPending) return;
    setErrorMessage(null);
    mutation.mutate(
      {
        id: current.template.id,
        data: { expectedVersion: current.template.currentVersion, fields, stages, migration },
      },
      { onSuccess: onDone, onError: (error: Error) => setErrorMessage(error.message) },
    );
  };

  return (
    <TemplateFieldsForm
      targetType={search.targetType}
      defaultValues={{
        name: current.template.name,
        stages: (current.stages ?? []).map((value) => ({ value })),
        fields: current.fields.map(toFieldForm),
      }}
      originalFields={current.fields}
      editableName={false}
      isPending={mutation.isPending}
      errorMessage={errorMessage}
      onSubmit={handleSubmit}
      onCancel={onDone}
    />
  );
}

// Arquivar não tem volta (não existe rota de desarquivar): confirmação
// inline, mesmo idioma de BlockRemoveForm (block-panel.tsx).
function ArchiveConfirm({ current, onDone }: { current: CurrentFieldTemplate; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const mutation = useMutation(archiveFieldTemplateMutation(queryClient));

  const handleArchive = () => {
    if (mutation.isPending) return;
    setErrorMessage(null);
    mutation.mutate(
      { id: current.template.id },
      { onSuccess: onDone, onError: (error: Error) => setErrorMessage(error.message) },
    );
  };

  return (
    <Panel className="grid gap-3" data-testid="archive-confirm">
      <ItemDescription>{t('archive_process_type_warning')}</ItemDescription>
      {errorMessage && (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" variant="destructive" disabled={mutation.isPending} onClick={handleArchive}>
          {t('archive')}
        </Button>
        <Button type="button" variant="basic" disabled={mutation.isPending} onClick={onDone}>
          {t('cancel')}
        </Button>
      </div>
    </Panel>
  );
}

export function CustomFieldDetailsPage() {
  const search = useSearch({ strict: false }) as CustomFieldDetailsSearch;
  const [mode, setMode] = useState<'view' | 'edit' | 'archive'>('view');
  const query = useQuery(currentFieldTemplateQuery(search.targetType, search.key));
  const current = query.data;
  // O template de cliente é único e obrigatório — só tipo de processo arquiva.
  const canArchive = search.targetType === 'process' && current && !current.template.archived;

  return (
    <Card asPage>
      <CardHeader title={current?.template.name ?? t('details')}>
        {current && mode === 'view' && (
          <CardAction>
            <Button variant="basic" onClick={() => setMode('edit')}>
              {t('edit')}
            </Button>
            {canArchive && (
              <Button variant="basic" onClick={() => setMode('archive')}>
                {t('archive')}
              </Button>
            )}
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <DefaultLoading />
        ) : !current ? (
          <DefaultEmptyData />
        ) : mode === 'edit' ? (
          <TemplateEdit current={current} search={search} onDone={() => setMode('view')} />
        ) : (
          <div className="grid gap-6">
            {mode === 'archive' && <ArchiveConfirm current={current} onDone={() => setMode('view')} />}
            <TemplateView current={current} search={search} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute('/_private/_admin/custom_fields/details')({
  component: CustomFieldDetailsPage,
  staticData: { title: t('details') },
  validateSearch: (search: Record<string, unknown>): CustomFieldDetailsSearch =>
    customFieldDetailsSearchSchema.parse(search),
});
