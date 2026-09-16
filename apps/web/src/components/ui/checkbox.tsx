import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';
import { CheckIcon } from 'lucide-react';
import { type ReactNode, useId } from 'react';
import { Label } from '@/components/ui/label.js';

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

type CheckboxProps = CheckboxPrimitive.Root.Props & {
  label?: ReactNode;
  labelClassName?: string;
  orientation?: VariantProps<typeof checkboxWrapperVariants>['orientation'];
};

function Checkbox({ className, label, labelClassName, orientation, id, ...props }: CheckboxProps) {
  const generatedId = useId();
  const checkboxId = id ?? generatedId;

  const checkbox = (
    <CheckboxPrimitive.Root
      id={checkboxId}
      data-slot="checkbox"
      className={cn(
        'peer relative flex size-4 shrink-0 items-center justify-center rounded-none border border-input transition-colors outline-none group-has-disabled/field:opacity-50 group-has-[:focus-visible]/field-label:ring-0 group-has-[:focus-visible]/field-label:not-data-checked:border-input after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground group-has-[:focus-visible]/field-label:data-checked:border-primary dark:data-checked:bg-primary',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        <CheckIcon />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );

  if (!label) return checkbox;

  return (
    <div className={cn(checkboxWrapperVariants({ orientation }))}>
      {checkbox}
      <Label htmlFor={checkboxId} className={cn('cursor-pointer text-sm leading-none', labelClassName)}>
        {label}
      </Label>
    </div>
  );
}

export { Checkbox };
