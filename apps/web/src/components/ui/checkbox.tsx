import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox';
import { cva, type VariantProps } from 'class-variance-authority';
import { Check } from 'lucide-react';
import { type ReactNode, useId } from 'react';
import { Label } from '@/components/ui/label.js';
import { cn } from '@/lib/utils.js';

const checkboxVariants = cva(
  [
    'peer size-4 shrink-0 rounded-[4px]',
    'cursor-pointer border border-border',
    'bg-background text-foreground',
    'hover:bg-accent',

    'outline-none transition-all',
    'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
    'data-disabled:pointer-events-none data-disabled:cursor-not-allowed data-disabled:opacity-50',
    'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
  ],
  {
    variants: {
      variant: {
        basic: 'data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground',
        default: 'data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground',
        blue: 'data-checked:border-sky-500 data-checked:bg-sky-500 data-checked:text-white',
        green: 'data-checked:border-green-600 data-checked:bg-green-600 data-checked:text-white',
      },
    },
    defaultVariants: {
      variant: 'basic',
    },
  },
);

const checkboxWrapperVariants = cva('flex', {
  variants: {
    orientation: {
      horizontal: 'flex-row items-center gap-2',
      vertical: 'flex-col items-center gap-1 whitespace-nowrap',
    },
  },
  defaultVariants: {
    orientation: 'horizontal',
  },
});

type CheckboxProps = CheckboxPrimitive.Root.Props &
  VariantProps<typeof checkboxVariants> & {
    label?: ReactNode;
    labelClassName?: string;
    orientation?: VariantProps<typeof checkboxWrapperVariants>['orientation'];
  };

function Checkbox({ className, variant = 'basic', label, labelClassName, orientation, id, ...props }: CheckboxProps) {
  const generatedId = useId();
  const checkboxId = id ?? generatedId;

  const checkbox = (
    <CheckboxPrimitive.Root
      id={checkboxId}
      data-slot="checkbox"
      className={cn(checkboxVariants({ variant, className }))}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        <Check className="size-3" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );

  if (!label) return checkbox;

  return (
    <div
      className={
        variant === 'basic'
          ? 'flex h-11 flex-row items-center gap-3 rounded-md border border-border bg-background px-4'
          : cn(checkboxWrapperVariants({ orientation }))
      }
    >
      {checkbox}
      <Label htmlFor={checkboxId} className={cn('cursor-pointer text-sm leading-none', labelClassName)}>
        {label}
      </Label>
    </div>
  );
}

export { Checkbox, checkboxVariants };
