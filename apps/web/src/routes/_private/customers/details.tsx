import type { FieldDef, StatusOption } from '@crm/contracts';
import { DEFAULT_CUSTOMER_TEMPLATE_KEY, hydrate } from '@crm/field-engine';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useSearch } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import type { FieldValues } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { DefaultEmptyData } from '@/components/default-empty-data.js';
import { DefaultFormLayout, type FormSection } from '@/components/default-form-layout.js';
import { DefaultLoading } from '@/components/default-loading.js';
import { DynamicField } from '@/components/dynamic-field/dynamic-field.js';
import { renderNodesToDefaultValues } from '@/components/dynamic-field/dynamic-field.utils.js';
import { BadgeIndicator } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardHeader } from '@/components/ui/card.js';
import { Input } from '@/components/ui/input.js';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item.js';
import { Label } from '@/components/ui/label.js';
import { patch } from '@/lib/api/client.api.js';
import { formatDate } from '@/lib/helpers/formatDate.helper.js';
import { t } from '@/lib/helpers/translate.helper.js';
import { type CustomerRecord, customerKeys, customerQuery, customerStatusOptions } from '@/query/customer.js';
import { currentCustomerTemplateQuery } from '@/query/fieldTemplate.js';
import { processesQuery } from '@/query/process.js';

// AD-030: `search: { id }`, nunca um `$customerId` path segment.
export const customerDetailsSearchSchema = z.object({ id: z.string().min(1) });
export type CustomerDetailsSearch = z.infer<typeof customerDetailsSearchSchema>;

type CustomerDetailsViewProps = { customer: CustomerRecord; statusOptions: StatusOption[] };

// `key==='status'` é o único campo com tratamento especial aqui — mesma
// convenção de fieldId usada pelo template (customerStatusOptions,
// query/customer.ts): resolve pra {label,color} (StatusOption) e usa o dot
// colorido; qualquer outro campo dinâmico continua genérico (raw value).
function CustomerDetailsView({ customer, statusOptions }: CustomerDetailsViewProps) {
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
        {Object.entries(customer.values).map(([key, value]) => {
          const statusOption =
            key === 'status' && typeof value === 'string'
              ? statusOptions.find((option) => option.key === value)
              : undefined;
          return (
            <Item key={key}>
              <ItemContent>
                <ItemTitle>{key === 'status' ? t('status') : key}</ItemTitle>
                <ItemDescription>
                  {statusOption ? (
                    <BadgeIndicator color={statusOption.color}>{statusOption.label}</BadgeIndicator>
                  ) : (
                    String(value)
                  )}
                </ItemDescription>
              </ItemContent>
            </Item>
          );
        })}
      </ItemGroup>

      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <ItemTitle>{t('customer.processes.title')}</ItemTitle>
          {/* WEB-07 AC1: "a partir do detalhe de um Customer" é a entrada
              primária do fluxo de criação de Process (T25) — mesma rota do
              atalho do card do kanban (WEB-10), search:{customerId} (AD-030). */}
          <Button asChild variant="basic">
            <Link to="/processes/add" search={{ customerId: customer.id }}>
              {t('process.new.action')}
            </Link>
          </Button>
        </div>
        {processesQueryResult.isLoading ? (
          <DefaultLoading />
        ) : !processesQueryResult.data?.items.length ? (
          <DefaultEmptyData />
        ) : (
          <ItemGroup>
            {processesQueryResult.data.items.map((process) => (
              // Abre o Process existente (WEB-08, T26/T27) — search:{id,
              // customerId} (AD-030), a mesma dupla que esta própria página
              // já tem em contexto.
              <Item key={process.id} asChild>
                <Link to="/processes/details" search={{ id: process.id, customerId: customer.id }}>
                  <ItemContent>
                    <ItemTitle>{process.stage}</ItemTitle>
                    <ItemDescription>{formatDate(process.createdAt)}</ItemDescription>
                  </ItemContent>
                </Link>
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

  const sections: FormSection[] = [
    {
      title: t('customer.create.section.identification'),
      description: t('customer.create.section.identification_description'),
      fields: [
        <div key="customer-identification" className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="name">{t('name')}</Label>
            <Input
              id="name"
              required
              placeholder={t('customer.create.field.name_placeholder')}
              {...register('name', { required: true })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="phone">{t('phone')}</Label>
            <Input
              id="phone"
              required
              placeholder={t('customer.create.field.phone_placeholder')}
              {...register('phone', { required: true })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="document">{t('document')}</Label>
            <Input
              id="document"
              placeholder={t('customer.create.field.document_placeholder')}
              {...register('document')}
            />
          </div>
        </div>,
      ],
    },
  ];

  // Mesmo raciocínio de customers/add/index.tsx: só adiciona "Detalhes
  // adicionais" quando o template de fato tem campos configurados.
  if (nodes.length > 0) {
    sections.push({
      title: t('customer.create.section.details'),
      description: t('customer.create.section.details_description'),
      fields: nodes.map((node) => (
        <DynamicField key={node.fieldId} node={node} name={`values.${node.fieldId}`} control={control} />
      )),
    });
  }

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="grid gap-6">
      <DefaultFormLayout sections={sections} />
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
  // Sempre busca (não só em modo edição, WEB-05): a visualização agora
  // também precisa do template pra resolver a bolinha+cor do campo `status`
  // (customerStatusOptions) — a view em si NUNCA bloqueia nela (fallback pro
  // valor cru enquanto carrega), só o form de edição continua esperando
  // (precisa do FieldDef inteiro pra montar os campos dinâmicos).
  const templateQuery = useQuery(currentCustomerTemplateQuery(DEFAULT_CUSTOMER_TEMPLATE_KEY));
  const statusOptions = useMemo(() => customerStatusOptions(templateQuery.data?.fields ?? []), [templateQuery.data]);

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
          <CustomerDetailsView customer={customer} statusOptions={statusOptions} />
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
