import { Loader2 as Loader } from 'lucide-react';
import type { ComponentProps } from 'react';
import { t } from '@/lib/helpers/translate.helper.js';
import { cn } from '@/lib/utils.js';

function Spinner({ className, ...props }: ComponentProps<'svg'>) {
  return <Loader role="status" aria-label={t('loading')} className={cn('size-4 animate-spin', className)} {...props} />;
}

export { Spinner };
