import type { FieldDef } from '@crm/contracts';
import type { RenderNode } from '@crm/field-engine';
import type { ReactElement } from 'react';
import type { Control } from 'react-hook-form';
import { useController } from 'react-hook-form';
import IconCalendar from '@/components/icons/Calendar.Icon.js';
import { Button } from '@/components/ui/button.js';
import { Calendar } from '@/components/ui/calendar.js';
import { Checkbox } from '@/components/ui/checkbox.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import { MoneyInput } from '@/components/ui/money-input.js';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { Switch } from '@/components/ui/switch.js';
import { formatDate } from '@/lib/helpers/formatDate.helper.js';
import { cn } from '@/lib/utils.js';

// Um único componente recursivo dispatcha por `node.type` (WEB-04/06/08 —
// "renderer único para qualquer tipo/profundidade de campo, sem código por
// template"). `control` fica sem parâmetro de tipo de propósito: os paths de
// `name` são inteiramente dinâmicos (montados pela recursão de
// array/group), então `Control<FieldValues>` (o default de react-hook-form)
// é o único tipo que aceita qualquer string em `name` sem cast por chamada.
export type DynamicFieldProps = {
  node: RenderNode;
  name: string;
  control: Control;
};

// Ajuda a tipar cada leaf/branch sem repetir a união inteira de FieldDef.
type NodeOfType<TType extends FieldDef['type']> = Extract<RenderNode, { type: TType }>;

type LeafProps<TType extends FieldDef['type']> = {
  node: NodeOfType<TType>;
  name: string;
  control: Control;
};

// Mesma linguagem visual do Input "default" (input.tsx) — sem promover isso
// a um novo primitive `ui/textarea.tsx`: dispatch prompt confirma que um
// <textarea> plano com o styling do Input é substituto aceitável quando o
// primitive não foi portado (fora do escopo desta batch).
const textareaClassName = cn(
  'flex min-h-20 w-full rounded-md border-input/50 border-b-2 bg-background px-4 py-2 font-medium font-mono text-sm leading-snug ring-1 ring-zinc-300 outline-none transition-all placeholder:text-muted-foreground hover:bg-secondary focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50',
);

function TextLeaf({ node, name, control }: LeafProps<'text'>) {
  const { field } = useController({ name, control });
  const value = typeof field.value === 'string' ? field.value : '';

  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{node.label}</Label>
      {node.multiline ? (
        <textarea
          id={name}
          className={textareaClassName}
          value={value}
          required={node.required}
          maxLength={node.maxLength}
          onChange={(e) => field.onChange(e.target.value)}
          onBlur={field.onBlur}
        />
      ) : (
        <Input
          id={name}
          value={value}
          required={node.required}
          maxLength={node.maxLength}
          onChange={(e) => field.onChange(e.target.value)}
          onBlur={field.onBlur}
        />
      )}
    </div>
  );
}

function NumberLeaf({ node, name, control }: LeafProps<'number'>) {
  const { field } = useController({ name, control });
  const value = typeof field.value === 'number' ? String(field.value) : '';

  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{node.label}</Label>
      <Input
        id={name}
        type="number"
        value={value}
        required={node.required}
        min={node.min}
        max={node.max}
        step={node.step ?? (node.integer ? 1 : undefined)}
        onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
        onBlur={field.onBlur}
      />
    </div>
  );
}

// Centavos inteiros sempre (nunca decimal) — mesmo contrato de
// field-engine/validate.ts. `MoneyInput` (já portado) formata a MÁSCARA de
// digitação sempre em pt-BR/BRL (money.helper.ts, fora do escopo desta
// task); o texto abaixo é quem realmente varia por `code`/`precision` do
// campo, via Intl.NumberFormat — o ponto que design.md pede.
function CurrencyLeaf({ node, name, control }: LeafProps<'currency'>) {
  const { field } = useController({ name, control });
  const cents = typeof field.value === 'number' ? field.value : 0;
  const formatted = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: node.code,
    minimumFractionDigits: node.precision,
    maximumFractionDigits: node.precision,
  }).format(cents / 10 ** node.precision);

  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{node.label}</Label>
      <MoneyInput id={name} required={node.required} value={cents} onChange={field.onChange} onBlur={field.onBlur} />
      <p className="text-muted-foreground text-xs">{formatted}</p>
    </div>
  );
}

function PercentLeaf({ node, name, control }: LeafProps<'percent'>) {
  const { field } = useController({ name, control });
  const value = typeof field.value === 'number' ? String(field.value) : '';

  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{node.label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={name}
          type="number"
          value={value}
          required={node.required}
          step={10 ** -node.precision}
          onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
          onBlur={field.onBlur}
        />
        <span aria-hidden>%</span>
      </div>
    </div>
  );
}

function BooleanLeaf({ node, name, control }: LeafProps<'boolean'>) {
  const { field } = useController({ name, control });

  return (
    <div className="flex items-center gap-2">
      <Switch id={name} checked={Boolean(field.value)} onCheckedChange={field.onChange} />
      <Label htmlFor={name}>{node.label}</Label>
    </div>
  );
}

// `date`/`datetime` compartilham o mesmo controle — o único diferencial é o
// formato ISO gravado (data pura vs. datetime completo), que casa com
// field-engine/validate.ts (`z.iso.date()`/`z.iso.datetime()`). O primitive
// `ui/date-picker.tsx` já portado não aceita value/onChange (é um demo
// auto-contido, sem props) — por isso este leaf compõe os mesmos blocos que
// ele usa (Popover/Calendar/Button/IconCalendar/formatDate), agora
// controlados via `field`, em vez de reabrir/alterar aquele arquivo.
type DateLeafProps = {
  node: NodeOfType<'date'> | NodeOfType<'datetime'>;
  name: string;
  control: Control;
};

// `date` grava só a data (z.iso.date(), "YYYY-MM-DD") — `new Date(raw)`/
// `date.toISOString()` passam pelo UTC e deslocam um dia em qualquer fuso
// negativo (ex.: America/Sao_Paulo). Por isso `date` usa componentes locais
// (nunca UTC) nas duas direções; `datetime` continua um timestamp real
// (z.iso.datetime()) e mantém o round-trip ISO/UTC de sempre.
const parseDateOnly = (value: string): Date => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const toDateOnlyString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function DateLeaf({ node, name, control }: DateLeafProps) {
  const { field } = useController({ name, control });
  const raw = typeof field.value === 'string' ? field.value : undefined;
  const selected = raw ? (node.type === 'date' ? parseDateOnly(raw) : new Date(raw)) : undefined;

  const handleSelect = (date: Date | undefined) => {
    if (!date) {
      field.onChange(null);
      return;
    }
    field.onChange(node.type === 'datetime' ? date.toISOString() : toDateOnlyString(date));
  };

  return (
    <div className="grid gap-2">
      {/* Sem `htmlFor`: um `<label for>` associado a um `<button>` sequestra
          o nome acessível do botão (label > conteúdo, no algoritmo de
          accname), silenciando a data selecionada para leitores de tela. O
          próprio texto do botão já é o nome acessível correto aqui. */}
      <Label>{node.label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant={selected ? undefined : 'primary'} className="justify-start font-normal">
            <IconCalendar className="mr-4 size-4" />
            {selected ? <p className="font-mono">{formatDate(selected)}</p> : <span>Escolha o dia</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0">
          {/* defaultMonth: abre já no mês do valor atual em vez de sempre
              "hoje" — melhor UX ao editar uma data existente distante. */}
          <Calendar mode="single" selected={selected} defaultMonth={selected} onSelect={handleSelect} />
        </PopoverContent>
      </Popover>
    </div>
  );
}

// Radix `Select` é inerentemente single-value — não existe `multiple` no
// primitive já portado (select.tsx), e reescrevê-lo está fora do escopo
// desta task. Para `multiple:true`, uma lista de `Checkbox` (já portado,
// T11) é a composição mais simples que ainda usa só primitives existentes.
function SelectLeaf({ node, name, control }: LeafProps<'select'>) {
  const { field } = useController({ name, control });

  if (node.multiple) {
    const values = Array.isArray(field.value) ? (field.value as string[]) : [];
    return (
      <div className="grid gap-2">
        <Label>{node.label}</Label>
        <div className="flex flex-col gap-2">
          {node.options.map((option) => (
            <Checkbox
              key={option.key}
              label={option.label}
              checked={values.includes(option.key)}
              onCheckedChange={(checked) =>
                field.onChange(checked ? [...values, option.key] : values.filter((v) => v !== option.key))
              }
            />
          ))}
        </div>
      </div>
    );
  }

  // '' (nunca undefined) mantém o Select sempre controlado — alternar entre
  // controlado/não-controlado dispara o warning do React e, mais grave,
  // deixa de refletir corretamente o valor após o primeiro onValueChange.
  const value = typeof field.value === 'string' ? field.value : '';
  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{node.label}</Label>
      <Select value={value} onValueChange={field.onChange}>
        <SelectTrigger id={name}>
          <SelectValue placeholder={node.label} />
        </SelectTrigger>
        <SelectContent>
          {node.options.map((option) => (
            <SelectItem key={option.key} value={option.key}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function StatusLeaf({ node, name, control }: LeafProps<'status'>) {
  const { field } = useController({ name, control });
  const value = typeof field.value === 'string' ? field.value : '';

  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{node.label}</Label>
      <Select value={value} onValueChange={field.onChange}>
        <SelectTrigger id={name}>
          <SelectValue placeholder={node.label} />
        </SelectTrigger>
        <SelectContent>
          {node.options.map((option) => (
            <SelectItem key={option.key} value={option.key}>
              <span
                aria-hidden
                className="inline-block size-2.5 rounded-full"
                style={{ backgroundColor: option.color }}
              />
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function DynamicField({ node, name, control }: DynamicFieldProps): ReactElement {
  switch (node.type) {
    case 'text':
      return <TextLeaf node={node} name={name} control={control} />;
    case 'number':
      return <NumberLeaf node={node} name={name} control={control} />;
    case 'currency':
      return <CurrencyLeaf node={node} name={name} control={control} />;
    case 'percent':
      return <PercentLeaf node={node} name={name} control={control} />;
    case 'boolean':
      return <BooleanLeaf node={node} name={name} control={control} />;
    case 'date':
    case 'datetime':
      return <DateLeaf node={node} name={name} control={control} />;
    case 'select':
      return <SelectLeaf node={node} name={name} control={control} />;
    case 'status':
      return <StatusLeaf node={node} name={name} control={control} />;
    // document/reference (fallback read-only) e array/group (recursão) são
    // implementados em T15 — nenhum destes 4 tipos é exercitado pelos testes
    // desta task, então um throw explícito é mais honesto que um fragmento
    // vazio silencioso.
    default:
      throw new Error(`Tipo de campo "${node.type}" ainda não implementado (T15).`);
  }
}
