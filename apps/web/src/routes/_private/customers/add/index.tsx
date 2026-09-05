import type { FieldDef } from '@crm/contracts';
import { DEFAULT_CUSTOMER_TEMPLATE_KEY, hydrate } from '@crm/field-engine';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import type { FieldValues } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { DefaultLoading } from '@/components/default-loading.js';
import { DynamicField } from '@/components/dynamic-field/dynamic-field.js';
import { renderNodesToDefaultValues } from '@/components/dynamic-field/dynamic-field.utils.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardHeader } from '@/components/ui/card.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import { post } from '@/lib/api/client.api.js';
import { t } from '@/lib/helpers/translate.helper.js';
import type { CustomerRecord } from '@/query/customer.js';
import { currentCustomerTemplateQuery } from '@/query/fieldTemplate.js';

// Sub-componente separado da página: `useForm`'s `defaultValues` só deve ser
// calculado UMA vez, a partir dos `fields` já carregados — por isso a página
// só monta `CustomerCreateForm` depois que `templateQuery` resolve (early
// return de loading), em vez de reagir a `fields` mudando de referência a
// cada render/refetch (o que resetaria o que o usuário já digitou).
type CustomerCreateFormProps = { fields: FieldDef[] };

function CustomerCreateForm({ fields }: CustomerCreateFormProps) {
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // hydrate(fields, {}) — WEB-04 AC1: sempre a árvore recursiva do template
  // corrente, mesmo quando `fields` está vazio (Edge Case: formulário
  // funciona normalmente com `values: {}`).
  const nodes = useMemo(() => hydrate(fields, {}), [fields]);

  // `useForm<FieldValues>` (não um tipo próprio): `DynamicField.control` é
  // `Control` (o default de react-hook-form, `Control<FieldValues>`) — mesmo
  // motivo documentado em dynamic-field.tsx/dynamic-field.unit.test.tsx.
  const { control, handleSubmit, register } = useForm<FieldValues>({
    defaultValues: { name: '', phone: '', document: '', values: renderNodesToDefaultValues(nodes) },
  });

  const mutation = useMutation({
    mutationFn: async (input: FieldValues) => {
      const res = await post<CustomerRecord>('/customers', {
        name: input.name,
        phone: input.phone,
        document: input.document || undefined,
        values: input.values,
      });
      if (!res.success || !res.data) throw new Error(res.message ?? t('customer.create.error'));
      return res.data;
    },
  });

  // WEB-13: `mutation.isPending` guarda tanto o `disabled` do botão (o
  // usuário não consegue clicar de novo pela UI) quanto o próprio handler
  // (um segundo `handleSubmit` disparado antes do primeiro resolver, ex. via
  // Enter + clique quase simultâneos, também é um no-op).
  const onSubmit = (input: FieldValues) => {
    if (mutation.isPending) return;
    setErrorMessage(null);
    mutation.mutate(input, {
      onSuccess: (data) => {
        navigate({ to: '/customers/details', search: { id: data.id } });
      },
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
      <div>
        <Button type="submit" disabled={mutation.isPending}>
          {t('save')}
        </Button>
      </div>
    </form>
  );
}

export function CustomerCreatePage() {
  const templateQuery = useQuery(currentCustomerTemplateQuery(DEFAULT_CUSTOMER_TEMPLATE_KEY));

  return (
    <Card asPage>
      <CardHeader title={t('customer.create.title')} />
      <CardContent>
        {templateQuery.isLoading ? (
          <DefaultLoading />
        ) : (
          <CustomerCreateForm fields={templateQuery.data?.fields ?? []} />
        )}
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute('/_private/customers/add/')({
  component: CustomerCreatePage,
  staticData: { title: t('customer.create.title') },
});
