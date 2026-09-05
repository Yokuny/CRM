import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils.js';

const btnVars = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium font-mono text-sm leading-none outline-none transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:-translate-y-px",
  {
    variants: {
      variant: {
        default:
          'relative border-input/50 border-b-2 bg-background ring-1 ring-zinc-300 hover:bg-secondary dark:border-input dark:ring-input',
        primary:
          'relative inset-shadow-sm inset-shadow-white flex border bg-secondary ring-0 duration-150 hover:bg-background dark:inset-shadow-black dark:border-border dark:bg-muted/25 dark:hover:bg-muted/50',
        basic:
          'relative border border-zinc-300 bg-background text-secondary-foreground duration-150 hover:bg-secondary',
        info: 'border-none bg-linear-to-r from-blue-600 to-blue-500 text-white transition-all duration-200 hover:scale-[1.02] hover:from-blue-500 hover:to-blue-600 hover:text-white active:scale-[0.98]',
        success:
          'border-none bg-linear-to-r from-green-600 to-green-500 text-white transition-all duration-200 hover:scale-[1.02] hover:from-green-500 hover:to-green-600 hover:text-white active:scale-[0.98]',
        destructive:
          'relative inset-shadow-2xs inset-shadow-background border border-destructive bg-destructive text-white shadow-zinc-950/10 duration-150 hover:bg-destructive/90 dark:bg-destructive/80',
        link: 'm-0 h-auto! w-auto! border-0 bg-transparent p-0! underline decoration-dashed underline-offset-4 shadow-none ring-0 hover:bg-transparent',
        blank: 'p-0!',
        financial:
          'justify-between rounded-none border-input border-b-2 bg-transparent font-normal shadow-none ring-0 hover:bg-transparent dark:border-input dark:bg-transparent dark:hover:bg-transparent',
      },
      size: {
        default: 'h-11 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5',
        lg: 'h-12 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-9',
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: ComponentProps<'button'> &
  VariantProps<typeof btnVars> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(btnVars({ variant, size, className }))}
      {...props}
    />
  );
}

const buttonVariants = btnVars;

export { Button, btnVars, buttonVariants };
