import { cva, type VariantProps } from 'class-variance-authority';
import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils.js';

const inputVariants = cva(
  'flex w-full min-w-0 cursor-text items-center gap-2 whitespace-nowrap rounded-md font-medium font-mono text-sm leading-none outline-none transition-all selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
  {
    variants: {
      variant: {
        basic:
          'border-input/50 bg-background ring-1 ring-zinc-300 hover:bg-secondary dark:border-input dark:ring-input',
        default:
          'border-input/50 border-b-2 bg-background ring-1 ring-zinc-300 hover:bg-secondary dark:border-input dark:ring-input',
        primary:
          'relative inset-shadow-sm inset-shadow-white border bg-secondary ring-0 duration-150 hover:bg-background dark:inset-shadow-black dark:border-border dark:bg-muted/25 dark:hover:bg-muted/50',
        financial:
          'rounded-none border-input border-b-2 bg-transparent shadow-none ring-0 hover:bg-transparent focus-visible:border-ring focus-visible:ring-0 dark:border-input dark:bg-transparent dark:hover:bg-transparent',
      },
      inputSize: {
        default: 'h-11 px-4 py-2',
        sm: 'h-8 px-2 py-2',
      },
    },
    defaultVariants: {
      variant: 'basic',
      inputSize: 'default',
    },
  },
);

function Input({ className, type, inputSize = 'default', variant = 'basic', ...props }: InputProps) {
  return (
    <input
      type={type}
      data-slot="input"
      data-variant={variant}
      data-size={inputSize}
      className={cn(inputVariants({ variant, inputSize, className }))}
      {...props}
    />
  );
}

export { Input };

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & VariantProps<typeof inputVariants>;

export type { InputProps };
