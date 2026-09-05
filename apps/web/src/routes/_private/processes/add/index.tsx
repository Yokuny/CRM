import { useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { z } from 'zod';
import { DefaultEmptyData } from '@/components/default-empty-data.js';
import { DefaultLoading } from '@/components/default-loading.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardHeader } from '@/components/ui/card.js';
import { ItemDescription, ItemTitle } from '@/components/ui/item.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { post } from '@/lib/api/client.api.js';
import { t } from '@/lib/helpers/translate.helper.js';
import { fieldTemplatesQuery } from '@/query/fieldTemplate.js';
import type { ProcessRecord } from '@/query/process.js';

// AD-030: `search: { customerId }`, nunca um `$customerId` path segment —
// tanto a jornada primária (a partir do detalhe do Customer, WEB-07 AC1)
// quanto o atalho do card do kanban (WEB-10) navegam para esta MESMA rota.
export const processesAddSearchSchema = z.object({ customerId: z.string().min(1) });
export type ProcessesAddSearch = z.infer<typeof processesAddSearchSchema>;

// FND-10-style: `useSearch({strict:false})` — mesmo motivo documentado em
// customers/index.tsx (T18): o componente fica testável isolado do router.
export function ProcessAddPage() {
  const search = useSearch({ strict: false }) as ProcessesAddSearch;
  const templatesQuery = useQuery(fieldTemplatesQuery('process'));
  const [selectedKey, setSelectedKey] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [created, setCreated] = useState<ProcessRecord | null>(null);

  // WEB-07 AC1: templates arquivados nunca aparecem selecionáveis — filtrados
  // fora da lista (nunca um item desabilitado que ainda "existe" no DOM).
  const availableTemplates = (templatesQuery.data?.items ?? []).filter((template) => !template.archived);

  const mutation = useMutation({
    mutationFn: async (templateKey: string) => {
      const res = await post<ProcessRecord>('/processes', { templateKey, customerId: search.customerId });
      if (!res.success || !res.data) throw new Error(res.message ?? t('process.create.error'));
      return res.data;
    },
  });

  // WEB-13-style: guarda contra duplo-clique, mesmo padrão de T22/T24.
  const onConfirm = () => {
    if (mutation.isPending || !selectedKey) return;
    setErrorMessage(null);
    mutation.mutate(selectedKey, {
      onSuccess: (data) => setCreated(data),
      // WEB-07 AC4: nunca navega como se tivesse sido criado — `created`
      // continua null, o picker segue visível com a mensagem de erro.
      onError: (error: Error) => setErrorMessage(error.message),
    });
  };

  return (
    <Card asPage>
      <CardHeader title={t('process.create.title')} />
      <CardContent>
        {templatesQuery.isLoading ? (
          <DefaultLoading />
        ) : created ? (
          <div className="grid gap-4">
            <ItemTitle>{t('process.create.success')}</ItemTitle>
            <ItemDescription>{created.stage}</ItemDescription>
            <Button asChild variant="basic">
              <Link to="/customers/details" search={{ id: search.customerId }}>
                {t('back')}
              </Link>
            </Button>
          </div>
        ) : availableTemplates.length === 0 ? (
          // WEB-07 AC2: mensagem explícita, nunca um picker vazio e silencioso
          // — bloqueia a tentativa (nenhum controle de seleção/confirmação
          // renderizado).
          <DefaultEmptyData />
        ) : (
          <div className="grid gap-4">
            <Select value={selectedKey} onValueChange={setSelectedKey}>
              <SelectTrigger>
                <SelectValue placeholder={t('process.template.placeholder')} />
              </SelectTrigger>
              <SelectContent>
                {availableTemplates.map((template) => (
                  <SelectItem key={template.key} value={template.key}>
                    {template.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errorMessage && (
              <p role="alert" className="text-destructive text-sm">
                {errorMessage}
              </p>
            )}
            <div>
              <Button onClick={onConfirm} disabled={!selectedKey || mutation.isPending}>
                {t('confirm')}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute('/_private/processes/add/')({
  component: ProcessAddPage,
  staticData: { title: t('process.create.title') },
  validateSearch: (search: Record<string, unknown>): ProcessesAddSearch => processesAddSearchSchema.parse(search),
});
