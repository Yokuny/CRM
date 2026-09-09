import { type CreateProduct, createProductSchema } from '@crm/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardHeader } from '@/components/ui/card.js';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form.js';
import { Input } from '@/components/ui/input.js';
import { MoneyInput } from '@/components/ui/money-input.js';
import { t } from '@/lib/helpers/translate.helper.js';
import { createProductMutation } from '@/query/product.js';

const DEFAULT_VALUES: CreateProduct = { name: '', sku: '', description: '', price: 0, stock: 0 };

// spec.md P1 "Cadastro de catálogo"/AC1/AC4: react-hook-form + zodResolver
// contra `createProductSchema` (packages/contracts, T4) — mesmo padrão
// canônico de routes/_public/auth/index.tsx (apps/web/CLAUDE.md: "Form/
// FormField/... + zodResolver com schema de @crm/contracts"). `active` nasce
// `default:true` no back-end (product.model.ts) — sem campo aqui, o toggle
// mora só na edição (T21, "editar stock/active/demais campos").
export function ProductAddPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const form = useForm<CreateProduct>({ resolver: zodResolver(createProductSchema), defaultValues: DEFAULT_VALUES });
  const mutation = useMutation(createProductMutation(queryClient));

  // WEB-13-style: guarda contra duplo-clique, mesmo padrão já usado em
  // processes/add/index.tsx/customers/add/index.tsx.
  const onSubmit = (data: CreateProduct) => {
    if (mutation.isPending) return;
    setErrorMessage(null);
    mutation.mutate(data, {
      // Done when: "Submissão bem-sucedida navega de volta pra listagem".
      onSuccess: () => navigate({ to: '/products' }),
      onError: (error: Error) => setErrorMessage(error.message),
    });
  };

  return (
    <Card asPage>
      <CardHeader title={t('product.create.title')} />
      <CardContent>
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
                      <MoneyInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
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
                        value={field.value}
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
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute('/_private/products/add/')({
  component: ProductAddPage,
  staticData: { title: t('product.create.title') },
});
