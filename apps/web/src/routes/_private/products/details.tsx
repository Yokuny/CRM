import { type UpdateProduct, updateProductSchema } from '@crm/contracts';
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
import { MoneyInput } from '@/components/ui/money-input.js';
import { formatMoney } from '@/lib/helpers/money.helper.js';
import { t } from '@/lib/helpers/translate.helper.js';
import {
  type ProductRecord,
  type ProductsListResult,
  productKeys,
  productsQuery,
  updateProductMutation,
} from '@/query/product.js';

// AD-030: `search: { id }`, nunca um `$id` path segment — mesmo padrão de
// customers/details.tsx.
export const productDetailsSearchSchema = z.object({ id: z.string().min(1) });
export type ProductDetailsSearch = z.infer<typeof productDetailsSearchSchema>;

// SPEC_DEVIATION: não há `GET /products/:id` (confirmado lendo
// apps/crm-api/src/routers/product.router.ts, T7 — só POST /, GET / e
// PATCH /:id).
// Reason: mesma situação já resolvida em processes/details.tsx ("Não há GET
// /processes/:id... esta rota resolve o registro filtrando `items`"), mas
// Product não é escopado por Customer (não existe um "list completo e
// naturalmente pequeno" por dono) — buscamos um limite alto o bastante pra
// cobrir o catálogo inteiro do tenant nesta fase P1, mesmo raciocínio de
// volume já aceito em design.md Risks & Concerns para searchProducts.ts.
// Reabrir com um endpoint dedicado (`GET /products/:id`) fica pra uma rodada
// futura se o volume real do catálogo justificar.
const CATALOG_FETCH_LIMIT = 500;

type ProductDetailsViewProps = { product: ProductRecord };

// Padrão view/edit documentado em apps/web/CLAUDE.md ("Detalhe de entidade")
// — mesmo componente-irmão de CustomerDetailsView (customers/details.tsx):
// lista os campos em modo leitura, `Editar` (CardAction) troca pro form.
function ProductDetailsView({ product }: ProductDetailsViewProps) {
  return (
    <ItemGroup>
      <Item>
        <ItemContent>
          <ItemTitle>{t('name')}</ItemTitle>
          <ItemDescription>{product.name}</ItemDescription>
        </ItemContent>
      </Item>
      <Item>
        <ItemContent>
          <ItemTitle>{t('product.sku')}</ItemTitle>
          <ItemDescription>{product.sku || '-'}</ItemDescription>
        </ItemContent>
      </Item>
      <Item>
        <ItemContent>
          <ItemTitle>{t('product.price')}</ItemTitle>
          <ItemDescription>{formatMoney(product.price)}</ItemDescription>
        </ItemContent>
      </Item>
      <Item>
        <ItemContent>
          <ItemTitle>{t('product.stock')}</ItemTitle>
          <ItemDescription>{product.stock}</ItemDescription>
        </ItemContent>
      </Item>
      <Item>
        <ItemContent>
          <ItemTitle>{t('product.description')}</ItemTitle>
          <ItemDescription>{product.description || '-'}</ItemDescription>
        </ItemContent>
      </Item>
      <Item>
        <ItemContent>
          <ItemTitle>{t('status')}</ItemTitle>
          <ItemDescription>{t(product.active ? 'product.status.active' : 'product.status.inactive')}</ItemDescription>
        </ItemContent>
      </Item>
    </ItemGroup>
  );
}

type ProductEditFormProps = { product: ProductRecord; onSaved: () => void; onCancel: () => void };

// Padrão view/edit (apps/web/CLAUDE.md): validado por `updateProductSchema`
// (packages/contracts, T4). `onSaved` fecha o modo edição — mesmo raciocínio
// de CustomerEditForm em customers/details.tsx, mas aqui a mutação já
// devolve o registro atualizado direto pro cache da lista (WEB-06-style),
// então não precisa de um `setQueryData` de detalhe dedicado.
function ProductEditForm({ product, onSaved, onCancel }: ProductEditFormProps) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const form = useForm<UpdateProduct>({
    resolver: zodResolver(updateProductSchema),
    defaultValues: {
      name: product.name,
      sku: product.sku ?? '',
      description: product.description ?? '',
      price: product.price,
      stock: product.stock,
      active: product.active,
    },
  });
  const mutation = useMutation(updateProductMutation(queryClient));

  const onSubmit = (data: UpdateProduct) => {
    if (mutation.isPending) return;
    setErrorMessage(null);
    mutation.mutate(
      { id: product.id, data },
      {
        // Escreve a resposta do SERVIDOR direto no cache da lista (não há
        // query de detalhe própria de Product) — mesmo raciocínio de
        // ProcessValuesForm em processes/details.tsx, evita um GET extra e
        // qualquer flash de dado desatualizado ao voltar pro modo leitura.
        onSuccess: (updated) => {
          queryClient.setQueryData<ProductsListResult>(productKeys.list({ limit: CATALOG_FETCH_LIMIT }), (old) =>
            old ? { ...old, items: old.items.map((item) => (item.id === updated.id ? updated : item)) } : old,
          );
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
              title: t('product.create.section.info'),
              description: t('product.create.section.info_description'),
              fields: [
                <div key="product-fields" className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('name')}</FormLabel>
                        <FormControl>
                          <Input placeholder={t('product.create.field.name_placeholder')} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="sku"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('product.sku')}</FormLabel>
                        <FormControl>
                          <Input placeholder={t('product.create.field.sku_placeholder')} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('product.price')}</FormLabel>
                        <FormControl>
                          <MoneyInput value={field.value ?? 0} onChange={field.onChange} onBlur={field.onBlur} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="stock"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('product.stock')}</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            step={1}
                            placeholder={t('product.create.field.stock_placeholder')}
                            value={field.value ?? 0}
                            onChange={(e) => field.onChange(e.target.value === '' ? 0 : Number(e.target.value))}
                            onBlur={field.onBlur}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>,
                <FormField
                  key="description"
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('product.description')}</FormLabel>
                      <FormControl>
                        <Input placeholder={t('product.create.field.description_placeholder')} {...field} />
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
                          label={t('product.status.active')}
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

// FND-10-style: `useSearch({strict:false})` — mesmo motivo já documentado em
// customers/details.tsx/processes/details.tsx: o componente fica testável
// isolado do router real.
export function ProductDetailsPage() {
  const search = useSearch({ strict: false }) as ProductDetailsSearch;
  const [isEditing, setIsEditing] = useState(false);
  const query = useQuery(productsQuery({ limit: CATALOG_FETCH_LIMIT }));
  const product = query.data?.items.find((item) => item.id === search.id);

  return (
    <Card asPage>
      <CardHeader title={t('product.details.title')}>
        {product && !isEditing && (
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
        ) : !product ? (
          // id ausente/inexistente ou de outro tenant (a query já é escopada
          // ao Tenant da sessão, apps/crm-api) — estado explícito de "não
          // encontrado", mesmo padrão de customers/details.tsx/
          // processes/details.tsx.
          <DefaultEmptyData />
        ) : isEditing ? (
          <ProductEditForm product={product} onSaved={() => setIsEditing(false)} onCancel={() => setIsEditing(false)} />
        ) : (
          <ProductDetailsView product={product} />
        )}
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute('/_private/products/details')({
  component: ProductDetailsPage,
  staticData: { title: t('product.details.title') },
  validateSearch: (search: Record<string, unknown>): ProductDetailsSearch => productDetailsSearchSchema.parse(search),
});
