import { type CreateCard, createCardSchema, type UpdateCard, updateCardSchema } from '@crm/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X as IconClose } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { DefaultFormLayout } from '@/components/default-form-layout.js';
import { Button } from '@/components/ui/button.js';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form.js';
import { Input } from '@/components/ui/input.js';
import { Panel } from '@/components/ui/item.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { t } from '@/lib/helpers/translate.helper.js';
import { type CardRecord, createCardMutation, deleteCardMutation, updateCardMutation } from '@/query/board.js';
import { customersQuery } from '@/query/customer.js';

// Sentinel de "sem cliente" pro <Select> opcional (Radix não aceita
// `value=""`) — mesmo raciocínio de appointment-panel.tsx (UNSET_VALUE),
// convertido de volta pra `undefined` no próprio `onValueChange`.
const UNSET_VALUE = '__none__';
const QUERY_LIMIT = 100;

export type CardPanelProps = {
  onClose: () => void;
  boardId: string;
  // Obrigatório no modo criar (a coluna de destino é decidida por QUAL botão
  // "novo card" foi clicado, T20) — ignorado no modo editar: KAN-16, editar
  // um card NUNCA expõe/altera sua coluna atual (isso é responsabilidade só
  // do drag-and-drop / moveCardMutation, rota dedicada).
  columnId?: string;
  // Ausente => modo "criar" (KAN-13); presente => editar/apagar um card
  // existente (KAN-16/KAN-17).
  card?: CardRecord;
};

// design.md/T18: painel INLINE, nunca um Dialog modal (AD-037) — mesmo
// formato de "único componente com dois modos" de appointment-panel.tsx/
// block-panel.tsx. SPEC_DEVIATION: process/order/assignee são inputs de
// texto (id bruto), não <Select> com busca — não existe hoje nenhuma query
// de frontend que liste TODOS os processos/pedidos/usuários de um tenant
// (processesQuery é escopado por customerId; não há usersQuery/ordersQuery
// genérica) e criar uma é fora do escopo de T18 (nenhum arquivo de query
// novo foi listado pra esta task). O back-end (card.service.ts, T9) já
// valida cada id informado por completo (existe + pertence ao tenant,
// KAN-14) antes de gravar. Reason: manter T18 restrito ao arquivo do painel,
// sem introduzir endpoint/hook novo não pedido pela task.
export function CardPanel({ onClose, boardId, columnId, card }: CardPanelProps) {
  return (
    <Panel className="grid gap-4">
      {card ? (
        <CardEditForm boardId={boardId} card={card} onClose={onClose} />
      ) : (
        <CardCreateForm boardId={boardId} columnId={columnId as string} onClose={onClose} />
      )}
    </Panel>
  );
}

type WithOnClose = { onClose: () => void };

// Mesmo PanelHeader de appointment-panel.tsx/block-panel.tsx (título +
// botão de fechar explícito — o painel inline não ganha o "X" de graça que
// um Dialog daria).
function PanelHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="flex w-fit items-center gap-2 font-medium font-mono text-sm leading-snug">{title}</h2>
      <Button type="button" variant="basic" onClick={onClose} aria-label={t('close')}>
        <IconClose className="size-4" />
      </Button>
    </div>
  );
}

type CardCreateFormProps = WithOnClose & { boardId: string; columnId: string };

// KAN-13: card 100% livre — só título é obrigatório (a coluna vem fixa do
// prop, nunca de um campo editável neste painel).
function CardCreateForm({ boardId, columnId, onClose }: CardCreateFormProps) {
  const queryClient = useQueryClient();
  const customersQueryResult = useQuery(customersQuery({ limit: QUERY_LIMIT }));

  // Sem generic explícito em useForm: createCardSchema mistura campos
  // opcionais com `.transform()` (optionalRefIdSchema) — o tipo INPUT do
  // resolver (pré-transform, o que useForm/Controller realmente manipulam)
  // difere do tipo OUTPUT `CreateCard` (z.infer, pós-transform) só na
  // opcionalidade da CHAVE customer/process/order/assignee. Deixar o
  // TypeScript inferir do próprio `zodResolver` evita esse descompasso;
  // `data` é convertido pra `CreateCard` só no limite da mutation (mesmo
  // formato de saída em runtime, o resolver já rodou o transform).
  const form = useForm({
    resolver: zodResolver(createCardSchema),
    defaultValues: {
      title: '',
      description: '',
      column: columnId,
      customer: undefined,
      process: undefined,
      order: undefined,
      assignee: undefined,
    },
  });
  const mutation = useMutation(createCardMutation(queryClient));

  // WEB-13-style: guarda contra duplo-clique, mesmo padrão de products/add/index.tsx.
  const onSubmit = (data: CreateCard) => {
    if (mutation.isPending) return;
    mutation.mutate(
      { boardId, data },
      {
        onSuccess: () => {
          form.reset({
            ...data,
            title: '',
            description: '',
            customer: undefined,
            process: undefined,
            order: undefined,
            assignee: undefined,
          });
          onClose();
        },
        onError: (error: Error) => toast.error(error.message),
      },
    );
  };

  return (
    <>
      <PanelHeader title={t('kanban.card.create.title')} onClose={onClose} />
      <Form {...form}>
        <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
          <DefaultFormLayout
            sections={[
              {
                title: t('kanban.card.section.info'),
                description: t('kanban.card.section.info_description'),
                layout: 'vertical',
                fields: [
                  <FormField
                    key="title"
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('kanban.card.field.title')}</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />,
                  <FormField
                    key="description"
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('kanban.card.field.description')}</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />,
                  <FormField
                    key="customer"
                    control={form.control}
                    name="customer"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('kanban.card.field.customer')}</FormLabel>
                        <Select
                          value={field.value ?? UNSET_VALUE}
                          onValueChange={(value) => field.onChange(value === UNSET_VALUE ? undefined : value)}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder={t('kanban.card.field.customer')} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value={UNSET_VALUE}>{t('kanban.card.field.none')}</SelectItem>
                            {(customersQueryResult.data?.items ?? []).map((customer) => (
                              <SelectItem key={customer.id} value={customer.id}>
                                {customer.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />,
                  <FormField
                    key="process"
                    control={form.control}
                    name="process"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('kanban.card.field.process')}</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />,
                  <FormField
                    key="order"
                    control={form.control}
                    name="order"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('kanban.card.field.order')}</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />,
                  <FormField
                    key="assignee"
                    control={form.control}
                    name="assignee"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('kanban.card.field.assignee')}</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />,
                ],
              },
            ]}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={mutation.isPending}>
              {t('save')}
            </Button>
          </div>
        </form>
      </Form>
    </>
  );
}

type CardEditFormProps = WithOnClose & { boardId: string; card: CardRecord };

// KAN-16/KAN-17: edita título/descrição/referências sem coluna/posição
// (updateCardSchema já as omite no nível de contrato) + apagar.
function CardEditForm({ boardId, card, onClose }: CardEditFormProps) {
  const queryClient = useQueryClient();
  const customersQueryResult = useQuery(customersQuery({ limit: QUERY_LIMIT }));

  const form = useForm<UpdateCard>({
    resolver: zodResolver(updateCardSchema),
    defaultValues: {
      title: card.title,
      description: card.description ?? '',
      customer: card.customer,
      process: card.process,
      order: card.order,
      assignee: card.assignee,
    },
  });
  const updateMutation = useMutation(updateCardMutation(queryClient));
  const deleteMutation = useMutation(deleteCardMutation(queryClient));

  const onSubmit = (data: UpdateCard) => {
    if (updateMutation.isPending) return;
    updateMutation.mutate(
      { boardId, cardId: card.id, data },
      { onSuccess: () => onClose(), onError: (error: Error) => toast.error(error.message) },
    );
  };

  const handleDelete = () => {
    if (deleteMutation.isPending) return;
    deleteMutation.mutate(
      { boardId, cardId: card.id },
      { onSuccess: () => onClose(), onError: (error: Error) => toast.error(error.message) },
    );
  };

  return (
    <>
      <PanelHeader title={card.title || t('kanban.card.detail.title')} onClose={onClose} />
      <Form {...form}>
        <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
          <DefaultFormLayout
            sections={[
              {
                title: t('kanban.card.section.info'),
                description: t('kanban.card.section.info_description'),
                layout: 'vertical',
                fields: [
                  <FormField
                    key="title"
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('kanban.card.field.title')}</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />,
                  <FormField
                    key="description"
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('kanban.card.field.description')}</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />,
                  <FormField
                    key="customer"
                    control={form.control}
                    name="customer"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('kanban.card.field.customer')}</FormLabel>
                        <Select
                          value={field.value ?? UNSET_VALUE}
                          onValueChange={(value) => field.onChange(value === UNSET_VALUE ? undefined : value)}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder={t('kanban.card.field.customer')} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value={UNSET_VALUE}>{t('kanban.card.field.none')}</SelectItem>
                            {(customersQueryResult.data?.items ?? []).map((customer) => (
                              <SelectItem key={customer.id} value={customer.id}>
                                {customer.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />,
                  <FormField
                    key="process"
                    control={form.control}
                    name="process"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('kanban.card.field.process')}</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />,
                  <FormField
                    key="order"
                    control={form.control}
                    name="order"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('kanban.card.field.order')}</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />,
                  <FormField
                    key="assignee"
                    control={form.control}
                    name="assignee"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('kanban.card.field.assignee')}</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />,
                ],
              },
            ]}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={updateMutation.isPending}>
              {t('save')}
            </Button>
            <Button type="button" variant="basic" disabled={deleteMutation.isPending} onClick={handleDelete}>
              {t('kanban.card.delete.action')}
            </Button>
          </div>
        </form>
      </Form>
    </>
  );
}
