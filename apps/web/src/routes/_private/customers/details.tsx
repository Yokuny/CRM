import type { FieldDef } from '@crm/contracts';
import { DEFAULT_CUSTOMER_TEMPLATE_KEY, hydrate } from '@crm/field-engine';
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
import { Card, CardAction, CardContent, CardHeader } from '@/components/ui/card.js';
import { Input } from '@/components/ui/input.js';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item.js';
import { Label } from '@/components/ui/label.js';
import { patch } from '@/lib/api/client.api.js';
import { formatDate } from '@/lib/helpers/formatDate.helper.js';
import { t } from '@/lib/helpers/translate.helper.js';
import { type CustomerRecord, customerKeys, customerQuery } from '@/query/customer.js';
import { currentCustomerTemplateQuery } from '@/query/fieldTemplate.js';
import { processesQuery } from '@/query/process.js';

// AD-030: `search: { id }`, nunca um `$customerId` path segment.
export const customerDetailsSearchSchema = z.object({ id: z.string().min(1) });
export type CustomerDetailsSearch = z.infer<typeof customerDetailsSearchSchema>;

type CustomerDetailsViewProps = { customer: CustomerRecord };

function CustomerDetailsView({ customer }: CustomerDetailsViewProps) {
  const processesQueryResult = useQuery(processesQuery(customer.id));

  return (
    <div className="grid gap-6">
      <ItemGroup>
        <Item>
          <ItemContent>
            <ItemTitle>{t('name')}</ItemTitle>
            <ItemDescription>{customer.name}</ItemDescription>
          </ItemContent>
        </Item>
        <Item>
          <ItemContent>
            <ItemTitle>{t('phone')}</ItemTitle>
            <ItemDescription>{customer.phone}</ItemDescription>
          </ItemContent>
        </Item>
        {customer.document && (
          <Item>
            <ItemContent>
              <ItemTitle>{t('document')}</ItemTitle>
              <ItemDescription>{customer.document}</ItemDescription>
            </ItemContent>
          </Item>
        )}
        {Object.entries(customer.values).map(([key, value]) => (
          <Item key={key}>
            <ItemContent>
              <ItemTitle>{key}</ItemTitle>
              <ItemDescription>{String(value)}</ItemDescription>
            </ItemContent>
          </Item>
        ))}
      </ItemGroup>

      <div className="grid gap-2">
        <ItemTitle>{t('customer.processes.title')}</ItemTitle>
        {processesQueryResult.isLoading ? (
          <DefaultLoading />
        ) : !processesQueryResult.data?.items.length ? (
          <DefaultEmptyData />
        ) : (
          <ItemGroup>
            {processesQueryResult.data.items.map((process) => (
              <Item key={process.id}>
                <ItemContent>
                  <ItemTitle>{process.stage}</ItemTitle>
                  <ItemDescription>{formatDate(process.createdAt)}</ItemDescription>
                </ItemContent>
              </Item>
            ))}
          </ItemGroup>
        )}
      </div>
    </div>
  );
}

type CustomerEditFormProps = {
  customer: CustomerRecord;
  fields: FieldDef[];
  onSaved: () => void;
  onCancel: () => void;
};

// WEB-06: mesmo shape de mutação/formulário de CustomerCreateForm (T22), com
// duas diferenças: `defaultValues` vem do registro JÁ carregado (não `{}`) —
// pré-preenche núcleo + `values` (AC1) — e a mutação é `PATCH`, não `POST`.
function CustomerEditForm({ customer, fields, onSaved, onCancel }: CustomerEditFormProps) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // hydrate(fields, customer.values) — nunca `{}`: WEB-06 AC1 exige
  // pré-preencher com os dados ATUAIS do registro.
  const nodes = useMemo(() => hydrate(fields, customer.values), [fields, customer.values]);

  const { control, handleSubmit, register } = useForm<FieldValues>({
    defaultValues: {
      name: customer.name,
      phone: customer.phone,
      document: customer.document ?? '',
      values: renderNodesToDefaultValues(nodes),
    },
  });

  const mutation = useMutation({
    mutationFn: async (input: FieldValues) => {
      const res = await patch<CustomerRecord>(`/customers/${encodeURIComponent(customer.id)}`, {
        name: input.name,
        phone: input.phone,
        document: input.document || undefined,
        values: input.values,
      });
      if (!res.success || !res.data) throw new Error(res.message ?? t('customer.edit.error'));
      return res.data;
    },
  });

  const onSubmit = (input: FieldValues) => {
    if (mutation.isPending) return;
    setErrorMessage(null);
    mutation.mutate(input, {
      // WEB-06 AC2: a mutação já devolve o registro atualizado — grava
      // diretamente no cache da query de detalhe em vez de invalidar+
      // reesperar um refetch, então o novo estado aparece sem reload manual
      // e sem uma segunda ida à rede.
      onSuccess: (data) => {
        queryClient.setQueryData(customerKeys.detail(customer.id), data);
        onSaved();
      },
      // WEB-06 AC3: nenhum setQueryData no erro — o registro original
      // permanece intacto no cache, e o formulário mantém o que o usuário
      // digitou (react-hook-form não reseta sozinho).
      onError: (error: Error) => setErrorMessage(error.message),
    });
  };

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="name">{t('name')}</Label>
          <Input id="name" required {...register('name', { required: true })} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="phone">{t('phone')}</Label>
          <Input id="phone" required {...register('phone', { required: true })} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="document">{t('document')}</Label>
          <Input id="document" {...register('document')} />
        </div>
      </div>
      {nodes.map((node) => (
        <DynamicField key={node.fieldId} node={node} name={`values.${node.fieldId}`} control={control} />
      ))}
      {errorMessage && (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={mutation.isPending}>
          {t('save')}
        </Button>
        <Button type="button" variant="basic" onClick={onCancel} disabled={mutation.isPending}>
          {t('cancel')}
        </Button>
      </div>
    </form>
  );
}

// FND-10-style: `useSearch({strict:false})` (não `Route.useSearch()`) —
// mesmo motivo já documentado em customers/index.tsx (T18): o componente
// fica testável isolado do router real.
export function CustomerDetailsPage() {
  const search = useSearch({ strict: false }) as CustomerDetailsSearch;
  const [isEditing, setIsEditing] = useState(false);
  const customerQueryResult = useQuery(customerQuery(search.id));
  // Só busca o template quando entra em modo edição — a visualização (WEB-05)
  // nunca precisa dele.
  const templateQuery = useQuery({
    ...currentCustomerTemplateQuery(DEFAULT_CUSTOMER_TEMPLATE_KEY),
    enabled: isEditing,
  });

  const customer = customerQueryResult.data;

  return (
    <Card asPage>
      <CardHeader title={t('customer.details.title')}>
        {customer && !isEditing && (
          <CardAction>
            <Button variant="basic" onClick={() => setIsEditing(true)}>
              {t('edit')}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {customerQueryResult.isLoading ? (
          <DefaultLoading />
        ) : !customer ? (
          // WEB-05 AC2: id ausente ou de outro tenant — estado explícito de
          // "não encontrado", nunca dados de outro tenant nem tela quebrada
          // (customerQuery já lança em success:false, então isLoading:false
          // + data:undefined cobre 404 E qualquer outra falha da mesma forma).
          <DefaultEmptyData />
        ) : isEditing ? (
          templateQuery.isLoading || !templateQuery.data ? (
            <DefaultLoading />
          ) : (
            <CustomerEditForm
              customer={customer}
              fields={templateQuery.data.fields}
              onSaved={() => setIsEditing(false)}
              onCancel={() => setIsEditing(false)}
            />
          )
        ) : (
          <CustomerDetailsView customer={customer} />
        )}
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute('/_private/customers/details')({
  component: CustomerDetailsPage,
  staticData: { title: t('customer.details.title') },
  validateSearch: (search: Record<string, unknown>): CustomerDetailsSearch => customerDetailsSearchSchema.parse(search),
});
