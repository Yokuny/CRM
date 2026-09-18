'use client';

import { cn } from 'cn';
import { ChevronLeft as IconLeft, ChevronRight as IconRight } from 'lucide-react';
import type * as React from 'react';

import { Button } from '@/components/ui/button.js';
import { t } from '@/lib/helpers/translate.helper.js';

function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto rounded-none border border-dashed border-border/60"
    >
      <table data-slot="table" className={cn('w-full caption-bottom text-xs', className)} {...props} />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return (
    <thead
      data-slot="table-header"
      className={cn('[&_tr]:border-b [&_tr]:border-dashed [&_tr]:border-border/60', className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return <tbody data-slot="table-body" className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        'border-t border-dashed border-border/60 bg-muted/50 font-medium [&>tr]:last:border-b-0',
        className,
      )}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'border-b border-dashed border-border/60 transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted',
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0',
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      className={cn('p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0', className)}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return (
    <caption data-slot="table-caption" className={cn('mt-4 text-xs text-muted-foreground', className)} {...props} />
  );
}

type TablePaginationProps = {
  pageIndex: number;
  pageSize: number;
  pageCount: number;
  onPaginationChange: (state: { pageIndex: number; pageSize: number }) => void;
};

// Contador + setas: era copiado verbatim nos seis `@components/*-table.tsx`
// (customers, professionals, spaces, products, conversation, orders). Toda
// tabela é server-driven (apps/web/CLAUDE.md), então só emite a nova página —
// nunca fatia dados em memória.
function TablePagination({ pageIndex, pageSize, pageCount, onPaginationChange }: TablePaginationProps) {
  return (
    <div data-slot="table-pagination" className="flex items-center justify-end gap-2">
      <span className="text-muted-foreground text-sm">
        {t('page')} {pageIndex + 1} / {Math.max(pageCount, 1)}
      </span>
      <Button
        type="button"
        variant="basic"
        onClick={() => onPaginationChange({ pageIndex: pageIndex - 1, pageSize })}
        disabled={pageIndex <= 0}
        aria-label={t('previous_page')}
      >
        <IconLeft className="size-4" />
      </Button>
      <Button
        type="button"
        variant="basic"
        onClick={() => onPaginationChange({ pageIndex: pageIndex + 1, pageSize })}
        disabled={pageIndex + 1 >= pageCount}
        aria-label={t('next_page')}
      >
        <IconRight className="size-4" />
      </Button>
    </div>
  );
}

export { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TablePagination, TableRow };
