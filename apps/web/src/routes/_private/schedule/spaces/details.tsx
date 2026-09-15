import { type UpdateSpace, updateSpaceSchema } from '@crm/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { DefaultEmptyData } from '@/components/default-empty-data.js';
import { DefaultFormLayout } from '@/components/default-form-layout.js';
import { DefaultLoading } from '@/components/default-loading.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardHeader } from '@/components/ui/card.js';
import { Checkbox } from '@/components/ui/checkbox.js';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form.js';
import { Input } from '@/components/ui/input.js';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item.js';
import { t } from '@/lib/helpers/translate.helper.js';
import { type SpaceRecord, spaceKeys, spaceQuery, updateSpaceMutation } from '@/query/space.js';

// AD-030: `search: { id }`, nunca um `$id` path segment — mesmo padrão de
// schedule/professionals/details.tsx.
export const spaceDetailsSearchSchema = z.object({ id: z.string().min(1) });
export type SpaceDetailsSearch = z.infer<typeof spaceDetailsSearchSchema>;

type SpaceDetailsViewProps = { space: SpaceRecord };

// Padrão view/edit documentado em apps/web/CLAUDE.md ("Detalhe de entidade").
function SpaceDetailsView({ space }: SpaceDetailsViewProps) {
  return (
    <ItemGroup>
      <Item>
        <ItemContent>
          <ItemTitle>{t('name')}</ItemTitle>
          <ItemDescription>{space.name}</ItemDescription>
        </ItemContent>
      </Item>
      <Item>
        <ItemContent>
          <ItemTitle>{t('status')}</ItemTitle>
          <ItemDescription>{t(space.active ? 'space.status.active' : 'space.status.inactive')}</ItemDescription>
        </ItemContent>
      </Item>
    </ItemGroup>
  );
}

type SpaceEditFormProps = { space: SpaceRecord; onSaved: () => void; onCancel: () => void };

// Padrão view/edit (apps/web/CLAUDE.md), validado por updateSpaceSchema
// (packages/contracts, T11).
function SpaceEditForm({ space, onSaved, onCancel }: SpaceEditFormProps) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const form = useForm<UpdateSpace>({
    resolver: zodResolver(updateSpaceSchema),
    defaultValues: { name: space.name, active: space.active },
  });
  const mutation = useMutation(updateSpaceMutation(queryClient));

  const onSubmit = (data: UpdateSpace) => {
    if (mutation.isPending) return;
    setErrorMessage(null);
    mutation.mutate(
      { id: space.id, data },
      {
        // Escreve a resposta do SERVIDOR direto no cache de detalhe — mesmo
        // raciocínio de ProfessionalEditForm em
        // schedule/professionals/details.tsx.
        onSuccess: (updated) => {
          queryClient.setQueryData(spaceKeys.detail(space.id), updated);
          onSaved();
        },
        onError: (error: Error) => setErrorMessage(error.message),
      },
    );
  };

  return (
    <Form {...form}>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="grid gap-6">
        <DefaultFormLayout
          sections={[
            {
              title: t('space.create.section.info'),
              description: t('space.create.section.info_description'),
              fields: [
                <FormField
                  key="name"
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('name')}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t('space.create.field.name_placeholder')}
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />,
                <FormField
                  key="active"
                  control={form.control}
                  name="active"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Checkbox
                          label={t('space.status.active')}
                          checked={field.value ?? true}
                          onCheckedChange={(checked) => field.onChange(checked === true)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />,
              ],
            },
          ]}
        />
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
    </Form>
  );
}

// FND-10-style: useSearch({strict:false}) — mesmo motivo já documentado em
// schedule/professionals/details.tsx/products/details.tsx: o componente
// fica testável isolado do router real.
export function SpaceDetailsPage() {
  const search = useSearch({ strict: false }) as SpaceDetailsSearch;
  const [isEditing, setIsEditing] = useState(false);
  const query = useQuery(spaceQuery(search.id));
  const space = query.data;

  return (
    <Card asPage>
      <CardHeader title={t('space.details.title')}>
        {space && !isEditing && (
          <CardAction>
            <Button variant="basic" onClick={() => setIsEditing(true)}>
              {t('edit')}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <DefaultLoading />
        ) : !space ? (
          // id ausente/inexistente ou de outro tenant (spaceQuery já lança
          // em success:false/404, então isLoading:false + data:undefined
          // cobre os dois casos da mesma forma) — estado explícito de "não
          // encontrado", mesmo padrão de schedule/professionals/details.tsx.
          <DefaultEmptyData />
        ) : isEditing ? (
          <SpaceEditForm space={space} onSaved={() => setIsEditing(false)} onCancel={() => setIsEditing(false)} />
        ) : (
          <SpaceDetailsView space={space} />
        )}
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute('/_private/schedule/spaces/details')({
  component: SpaceDetailsPage,
  staticData: { title: t('space.details.title') },
  validateSearch: (search: Record<string, unknown>): SpaceDetailsSearch => spaceDetailsSearchSchema.parse(search),
});
