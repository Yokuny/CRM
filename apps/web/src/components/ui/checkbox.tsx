import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { cva, type VariantProps } from 'class-variance-authority';
import { type ComponentProps, type ReactNode, useId } from 'react';
import Check from '@/components/icons/Check.Icon.js';
import { Label } from '@/components/ui/label.js';
import { cn } from '@/lib/utils.js';

const checkboxVariants = cva(
  [
    'peer size-4 shrink-0 rounded-[4px]',
    'cursor-pointer border border-zinc-300 dark:border-input',
    'bg-background text-foreground',
    'hover:bg-accent',

    'outline-none transition-all',
    'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
    'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
    'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
  ],
  {
    variants: {
      variant: {
        basic:
          'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
        default:
          'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
        blue: 'data-[state=checked]:border-sky-500 data-[state=checked]:bg-sky-500 data-[state=checked]:text-white',
        green:
          'data-[state=checked]:border-green-600 data-[state=checked]:bg-green-600 data-[state=checked]:text-white',
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

type CheckboxProps = ComponentProps<typeof CheckboxPrimitive.Root> &
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
          ? 'flex h-11 flex-row items-center gap-3 rounded-md border border-zinc-300 bg-background px-4 dark:border-input'
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
