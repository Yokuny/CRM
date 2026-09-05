import type { FieldDef } from '@crm/contracts';
import { hydrate } from '@crm/field-engine';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useSearch } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import type { FieldValues } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { DefaultEmptyData } from '@/components/default-empty-data.js';
import { DefaultLoading } from '@/components/default-loading.js';
import { DynamicField } from '@/components/dynamic-field/dynamic-field.js';
import { renderNodesToDefaultValues } from '@/components/dynamic-field/dynamic-field.utils.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardHeader } from '@/components/ui/card.js';
import { patch } from '@/lib/api/client.api.js';
import { t } from '@/lib/helpers/translate.helper.js';
import { processTemplateVersionQuery } from '@/query/fieldTemplate.js';
import { type ProcessesListResult, type ProcessRecord, processesQuery, processKeys } from '@/query/process.js';

// AD-030: `search: { id, customerId }`, nunca um `$processId` path segment —
// não há `GET /processes/:id` (confirmado lendo process.router.ts); esta
// rota resolve o registro filtrando `processesQuery(customerId)`'s `items`
// pelo `id`, então `customerId` é sempre necessário aqui também (todo caller
// que linka pra cá — Customer detail T23, atalho do kanban T25 — já tem os
// dois no contexto).
export const processDetailsSearchSchema = z.object({ id: z.string().min(1), customerId: z.string().min(1) });
export type ProcessDetailsSearch = z.infer<typeof processDetailsSearchSchema>;

type ProcessValuesFormProps = { process: ProcessRecord; fields: FieldDef[]; customerId: string };

// WEB-08 (metade `values`): mesmo shape de mutação/formulário de
// CustomerEditForm (T24), com duas diferenças: `defaultValues` É o próprio
// `values` do Process (sem núcleo nome/telefone — Process não tem), e a
// mutação é `PATCH /processes/:id/values`.
function ProcessValuesForm({ process, fields, customerId }: ProcessValuesFormProps) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const nodes = useMemo(() => hydrate(fields, process.values), [fields, process.values]);

  const { control, handleSubmit, reset } = useForm<FieldValues>({
    defaultValues: renderNodesToDefaultValues(nodes),
  });

  const mutation = useMutation({
    mutationFn: async (values: FieldValues) => {
      const res = await patch<ProcessRecord>(`/processes/${encodeURIComponent(process.id)}/values`, { values });
      if (!res.success || !res.data) throw new Error(res.message ?? t('process.values.error'));
      return res.data;
    },
  });

  const onSubmit = (values: FieldValues) => {
    if (mutation.isPending) return;
    setErrorMessage(null);
    mutation.mutate(values, {
      // WEB-08 AC2: reflete o novo estado sem reload manual — grava a
      // resposta da mutação direto na lista já em cache (não há
      // `GET /processes/:id`, então não há uma query de detalhe pra
      // invalidar) e re-semeia o form com o valor que o SERVIDOR devolveu
      // (nunca só o que foi digitado — prova real de round-trip, não um
      // no-op local).
      onSuccess: (data) => {
        queryClient.setQueryData<ProcessesListResult>(processKeys.list(customerId), (old) =>
          old ? { items: old.items.map((item) => (item.id === data.id ? data : item)) } : old,
        );
        reset(renderNodesToDefaultValues(hydrate(fields, data.values)));
      },
      onError: (error: Error) => setErrorMessage(error.message),
    });
  };

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="grid gap-6">
      {nodes.map((node) => (
        <DynamicField key={node.fieldId} node={node} name={node.fieldId} control={control} />
      ))}
      {errorMessage && (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage}
        </p>
      )}
      <div>
        <Button type="submit" disabled={mutation.isPending}>
          {t('save')}
        </Button>
      </div>
    </form>
  );
}

// FND-10-style: `useSearch({strict:false})` — mesmo motivo documentado em
// customers/index.tsx (T18): o componente fica testável isolado do router.
export function ProcessDetailsPage() {
  const search = useSearch({ strict: false }) as ProcessDetailsSearch;
  const processesQueryResult = useQuery(processesQuery(search.customerId));
  const process = processesQueryResult.data?.items.find((item) => item.id === search.id);

  // WEB-08 AC1: SEMPRE a versão PRÓPRIA do registro (process.template +
  // process.templateVersion) — nunca `GET /field-templates/current`, mesmo
  // que o template já tenha avançado depois (AD-023, snapshot).
  const versionQuery = useQuery({
    ...processTemplateVersionQuery(process?.template ?? '', process?.templateVersion ?? 0),
    enabled: Boolean(process),
  });

  const isLoading = processesQueryResult.isLoading || (Boolean(process) && versionQuery.isLoading);

  return (
    <Card asPage>
      <CardHeader title={t('process.details.title')} />
      <CardContent>
        {isLoading ? (
          <DefaultLoading />
        ) : !process || !versionQuery.data ? (
          <DefaultEmptyData />
        ) : (
          <ProcessValuesForm process={process} fields={versionQuery.data.fields} customerId={search.customerId} />
        )}
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute('/_private/processes/details')({
  component: ProcessDetailsPage,
  staticData: { title: t('process.details.title') },
  validateSearch: (search: Record<string, unknown>): ProcessDetailsSearch => processDetailsSearchSchema.parse(search),
});
