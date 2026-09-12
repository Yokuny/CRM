import { type CreateBlock, createBlockSchema } from '@crm/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.js';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.js';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form.js';
import { Input } from '@/components/ui/input.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { formatDisplayDate, formatDisplayTime } from '@/lib/helpers/displayTime.helper.js';
import { t } from '@/lib/helpers/translate.helper.js';
import { type AppointmentRecord, createBlockMutation, deleteBlockMutation } from '@/query/appointment.js';
import { professionalsQuery } from '@/query/professional.js';

const QUERY_LIMIT = 100;

export type BlockDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Ausente => modo "criar" (SCH-33); presente => bloqueio já existente,
  // aberto só pra ser removido (nenhum campo é editável — remarcar um
  // bloqueio não é um caso de uso do spec, só criar/remover).
  block?: AppointmentRecord;
};

// T41: mesmo formato de "único Dialog com dois modos" de appointment-dialog.tsx
// (T40) — aqui os dois modos são bem mais simples (criar/remover, sem ação de
// edição intermediária).
export function BlockDialog({ open, onOpenChange, block }: BlockDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {block ? (
          <BlockRemoveForm block={block} onOpenChange={onOpenChange} />
        ) : (
          <BlockCreateForm onOpenChange={onOpenChange} />
        )}
      </DialogContent>
    </Dialog>
  );
}

type WithOnOpenChange = { onOpenChange: (open: boolean) => void };

// SCH-33: bloqueio de horário (folga, feriado, reunião) — profissional,
// início/fim (hora de parede, AD-036) e título, validados por
// `zodResolver(createBlockSchema)` (mesmo padrão de
// AppointmentCreateForm/appointment-dialog.tsx).
function BlockCreateForm({ onOpenChange }: WithOnOpenChange) {
  const queryClient = useQueryClient();
  const professionalsQueryResult = useQuery(professionalsQuery({ limit: QUERY_LIMIT }));

  const form = useForm<CreateBlock>({
    resolver: zodResolver(createBlockSchema),
    defaultValues: { professionalId: '', startDate: '', startTime: '', endDate: '', endTime: '', title: '' },
  });
  const mutation = useMutation(createBlockMutation(queryClient));

  // WEB-13-style: guarda contra duplo-clique, mesmo padrão de products/add/index.tsx.
  const onSubmit = (data: CreateBlock) => {
    if (mutation.isPending) return;
    mutation.mutate(data, {
      onSuccess: () => {
        form.reset();
        onOpenChange(false);
      },
      // 409 (sobreposição) ou qualquer outra falha vira toast — mesmo idioma
      // de composer.tsx.
      onError: (error: Error) => toast.error(error.message),
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('block.create.title')}</DialogTitle>
      </DialogHeader>
      <Form {...form}>
        <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
          <FormField
            control={form.control}
            name="professionalId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('appointment.field.professional')}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t('appointment.field.professional')} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {(professionalsQueryResult.data?.items ?? []).map((professional) => (
                      <SelectItem key={professional.id} value={professional.id}>
                        {professional.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('block.field.title')}</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="startDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('block.field.start_date')}</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="startTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('block.field.start_time')}</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="endDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('block.field.end_date')}</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="endTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('block.field.end_time')}</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {t('save')}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}

type BlockRemoveFormProps = WithOnOpenChange & { block: AppointmentRecord };

// SCH-33: "o bloqueio SHALL poder ser removido" — sem edição, só
// visualização + remoção (DELETE /appointments/blocks/:id, T37).
function BlockRemoveForm({ block, onOpenChange }: BlockRemoveFormProps) {
  const queryClient = useQueryClient();
  const mutation = useMutation(deleteBlockMutation(queryClient));

  const handleDelete = () => {
    if (mutation.isPending) return;
    mutation.mutate(
      { id: block.id },
      { onSuccess: () => onOpenChange(false), onError: (error: Error) => toast.error(error.message) },
    );
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{block.title ?? t('block.detail.title')}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-1">
        <p className="text-muted-foreground text-sm">
          {formatDisplayDate(block.start)} · {formatDisplayTime(block.start)}–{formatDisplayTime(block.end)}
        </p>
        {block.professionalName && <p className="text-muted-foreground text-sm">{block.professionalName}</p>}
      </div>
      <DialogFooter>
        <Button type="button" variant="basic" disabled={mutation.isPending} onClick={handleDelete}>
          {t('block.action.remove')}
        </Button>
      </DialogFooter>
    </>
  );
}
