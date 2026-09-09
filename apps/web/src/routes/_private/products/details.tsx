import { type UpdateProduct, updateProductSchema } from '@crm/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { DefaultEmptyData } from '@/components/default-empty-data.js';
import { DefaultLoading } from '@/components/default-loading.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardHeader } from '@/components/ui/card.js';
import { Checkbox } from '@/components/ui/checkbox.js';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form.js';
import { Input } from '@/components/ui/input.js';
import { MoneyInput } from '@/components/ui/money-input.js';
import { t } from '@/lib/helpers/translate.helper.js';
import { type ProductRecord, productsQuery, updateProductMutation } from '@/query/product.js';

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

type ProductEditFormProps = { product: ProductRecord };

// T21 Done when: "edita stock/active/demais campos" — um único formulário
// sempre editável (sem alternância view/edit, que ninguém pediu aqui — mesmo
// espírito de ProcessValuesForm/ProcessStageControl em processes/details.tsx),
// validado por `updateProductSchema` (packages/contracts, T4).
function ProductEditForm({ product }: ProductEditFormProps) {
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
        // A mutação já devolve o registro atualizado — re-semeia o form com
        // o valor que o SERVIDOR devolveu (nunca só o que foi digitado),
        // mesmo raciocínio de ProcessValuesForm em processes/details.tsx.
        onSuccess: (updated) => {
          form.reset({
            name: updated.name,
            sku: updated.sku ?? '',
            description: updated.description ?? '',
            price: updated.price,
            stock: updated.stock,
            active: updated.active,
          });
        },
        onError: (error: Error) => setErrorMessage(error.message),
      },
    );
  };

  return (
    <Form {...form}>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="grid gap-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('name')}</FormLabel>
                <FormControl>
                  <Input {...field} />
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
                  <Input {...field} />
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
                    value={field.value ?? 0}
                    onChange={(e) => field.onChange(e.target.value === '' ? 0 : Number(e.target.value))}
                    onBlur={field.onBlur}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('product.description')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
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
        />
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
    </Form>
  );
}

// FND-10-style: `useSearch({strict:false})` — mesmo motivo já documentado em
// customers/details.tsx/processes/details.tsx: o componente fica testável
// isolado do router real.
export function ProductDetailsPage() {
  const search = useSearch({ strict: false }) as ProductDetailsSearch;
  const query = useQuery(productsQuery({ limit: CATALOG_FETCH_LIMIT }));
  const product = query.data?.items.find((item) => item.id === search.id);

  return (
    <Card asPage>
      <CardHeader title={t('product.details.title')} />
      <CardContent>
        {query.isLoading ? (
          <DefaultLoading />
        ) : !product ? (
          // id ausente/inexistente ou de outro tenant (a query já é escopada
          // ao Tenant da sessão, apps/crm-api) — estado explícito de "não
          // encontrado", mesmo padrão de customers/details.tsx/
          // processes/details.tsx.
          <DefaultEmptyData />
        ) : (
          <ProductEditForm product={product} />
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
