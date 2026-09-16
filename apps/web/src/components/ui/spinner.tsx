import { cn } from 'cn';
import { Loader2Icon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { t } from '@/lib/helpers/translate.helper.js';

function Spinner({ className, ...props }: ComponentProps<'svg'>) {
  return (
    <Loader2Icon
      data-slot="spinner"
      role="status"
      aria-label={t('loading')}
      className={cn('size-4 animate-spin', className)}
      {...props}
    />
  );
}

export { Spinner };
