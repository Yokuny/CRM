import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card.js';
import { t } from '@/lib/helpers/translate.helper.js';
import { createFieldTemplateMutation } from '@/query/fieldTemplate.js';
import { TemplateFieldsForm, type TemplateSubmit } from '../@components/template-fields-form.js';
import { emptyField, toSnakeKey } from '../@utils/template-form.utils.js';

// Só tipos de processo: o template de cliente é único e já nasce com o
// tenant (POST de outro devolveria already_exists). A `key` sai do nome
// ("Tratamento estético" -> "tratamento_estetico") e é o que o processo e o
// details.tsx usam pra achar o template.
export function CustomFieldAddPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const mutation = useMutation(createFieldTemplateMutation(queryClient));

  const handleSubmit = ({ name, fields, stages }: TemplateSubmit) => {
    if (mutation.isPending) return;
    setErrorMessage(null);
    const key = toSnakeKey(name);
    mutation.mutate(
      { targetType: 'process', key, name, fields, stages },
      {
        onSuccess: () => navigate({ to: '/custom_fields/details', search: { targetType: 'process', key } }),
        onError: (error: Error) => setErrorMessage(error.message),
      },
    );
  };

  return (
    <Card asPage>
      <CardHeader title={t('new_process_type')} />
      <CardContent>
        <TemplateFieldsForm
          targetType="process"
          defaultValues={{ name: '', stages: [{ value: '' }], fields: [emptyField()] }}
          originalFields={[]}
          editableName
          isPending={mutation.isPending}
          errorMessage={errorMessage}
          onSubmit={handleSubmit}
        />
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute('/_private/_admin/custom_fields/add/')({
  component: CustomFieldAddPage,
  staticData: { title: t('new_process_type') },
});
