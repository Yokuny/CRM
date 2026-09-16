import { Select as SelectPrimitive } from '@base-ui/react/select';
import { cva } from 'class-variance-authority';
import { Check as IconCheck, ChevronDown as IconDown, ChevronUp as IconUp } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils.js';

type SelectTriggerSize = 'default' | 'sm' | 'lg' | 'icon' | 'icon-sm' | 'icon-lg';

const selectTriggerVariants = cva(
  'relative flex w-fit items-center justify-between gap-2 whitespace-nowrap rounded-md font-mono text-sm leading-none outline-none transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 dark:aria-invalid:ring-destructive/40 [&_svg:not([class*="size-"])]:size-4 [&_svg:not([class*="text-"])]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        basic: 'border-input/50 bg-background ring-1 ring-border hover:bg-secondary',
        default: 'border-input/50 border-b-2 bg-background ring-1 ring-border hover:bg-secondary',
        primary:
          'inset-shadow-sm inset-shadow-white border bg-secondary ring-0 duration-150 hover:bg-background dark:inset-shadow-black dark:border-border dark:bg-muted/25 dark:hover:bg-muted/50',
        financial:
          'rounded-none border-input border-b-2 bg-transparent ring-0 hover:bg-transparent focus-visible:border-ring focus-visible:ring-0 dark:border-input dark:bg-transparent dark:hover:bg-transparent',
      },
      size: {
        default: 'h-11 px-3 py-2',
        sm: 'h-8 px-3 py-2',
        lg: 'h-12 px-3 py-2',
        icon: 'size-9',
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'basic',
      size: 'default',
    },
  },
);

// Bare re-export, sem wrapper próprio: `SelectPrimitive.Root.Props` é
// genérico (<Value, Multiple>), o que quebra o padrão usual de
// `ComponentProps<typeof X>` — mesma saída que o próprio registry base-sera
// usa pra esse componente.
const Select = SelectPrimitive.Root;

function SelectGroup({ ...props }: SelectPrimitive.Group.Props) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />;
}

function SelectValue({ ...props }: SelectPrimitive.Value.Props) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

function SelectTrigger({
  className,
  size = 'default',
  children,
  variant = 'basic',
  ...props
}: SelectPrimitive.Trigger.Props & {
  size?: SelectTriggerSize;
  variant?: 'basic' | 'default' | 'primary' | 'financial';
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-variant={variant}
      data-size={size}
      className={cn(selectTriggerVariants({ variant, size, className }))}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon render={<IconDown className="stroke-2" />} />
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  side = 'bottom',
  sideOffset = 4,
  align = 'center',
  alignOffset = 0,
  // O wrapper original defaultava pra `position="popper"` (nunca
  // "item-aligned"), sobrescrevendo o default do próprio Radix — o
  // equivalente correto aqui é `alignItemWithTrigger={false}` (não o
  // `true` que o registry base-sera usa, que corresponde a
  // "item-aligned"). Nenhum consumidor no app passa `position`, então
  // esse é o único default que preserva o comportamento visual atual.
  alignItemWithTrigger = false,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<SelectPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset' | 'alignItemWithTrigger'>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-50"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            'relative isolate z-50 max-h-(--available-height) min-w-[8rem] origin-(--transform-origin) overflow-y-auto overflow-x-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-closed:animate-out data-open:animate-in data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
            !alignItemWithTrigger &&
              'data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1',
            className,
          )}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List
            className={cn('p-1', alignItemWithTrigger && 'w-(--anchor-width) min-w-(--anchor-width) scroll-my-1')}
          >
            {children}
          </SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

// Radix `Select.Label` (usado dentro de um `Select.Group`) virou
// `SelectPrimitive.GroupLabel` no Base UI — `SelectPrimitive.Label` agora é
// uma parte NOVA e diferente (rótulo associado ao trigger, não ao grupo). O
// nome público do wrapper continua `SelectLabel` pra não quebrar quem já
// importa daqui (mesmo padrão do HoverCard/PreviewCard).
function SelectLabel({ className, ...props }: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn('px-2 py-1.5 text-muted-foreground text-xs', className)}
      {...props}
    />
  );
}

function SelectItem({ className, children, ...props }: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default select-none items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className,
      )}
      {...props}
    >
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <IconCheck className="size-3" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({ className, ...props }: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn('pointer-events-none -mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  );
}

function SelectScrollUpButton({ className, ...props }: ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn('flex cursor-default items-center justify-center py-1', className)}
      {...props}
    >
      <IconUp className="size-3" />
    </SelectPrimitive.ScrollUpArrow>
  );
}

function SelectScrollDownButton({ className, ...props }: ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn('flex cursor-default items-center justify-center py-1', className)}
      {...props}
    >
      <IconDown className="size-3" />
    </SelectPrimitive.ScrollDownArrow>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
