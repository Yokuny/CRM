import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps, HTMLAttributes, ReactNode } from 'react';
import IconDown from '@/components/icons/Down.Icon.js';
import IconMinus from '@/components/icons/Minus.Icon.js';
import IconUp from '@/components/icons/Up.Icon.js';
import { cn } from '@/lib/utils.js';

// ─── CVA ────────────────────────────────────────────────────────────────────

const badgeVars = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 font-medium text-xs transition-colors [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        // ── Semânticas / UI ──────────────────────────────────────────────
        default:
          'bg-blue-50 text-blue-900 ring-1 ring-blue-500/30 ring-inset dark:bg-blue-400/10 dark:text-blue-400 dark:ring-blue-400/30',
        secondary:
          'bg-gray-50 text-gray-900 ring-1 ring-gray-500/30 ring-inset dark:bg-gray-400/10 dark:text-gray-400 dark:ring-gray-400/20',
        outline: 'bg-transparent text-foreground ring-1 ring-border ring-inset',
        muted: 'bg-transparent text-foreground ring-1 ring-border ring-inset',
        success:
          'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-600/30 ring-inset dark:bg-emerald-400/10 dark:text-emerald-400 dark:ring-emerald-400/20',
        active:
          'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-600/30 ring-inset dark:bg-emerald-400/10 dark:text-emerald-400 dark:ring-emerald-400/20',
        warning:
          'bg-yellow-50 text-yellow-900 ring-1 ring-yellow-600/30 ring-inset dark:bg-yellow-400/10 dark:text-yellow-500 dark:ring-yellow-400/20',
        error:
          'bg-red-50 text-red-900 ring-1 ring-red-600/20 ring-inset dark:bg-red-400/10 dark:text-red-400 dark:ring-red-400/20',
        info: 'bg-blue-50 text-blue-900 ring-1 ring-blue-500/30 ring-inset dark:bg-blue-400/10 dark:text-blue-400 dark:ring-blue-400/30',
        neutral:
          'bg-gray-50 text-gray-900 ring-1 ring-gray-500/30 ring-inset dark:bg-gray-400/10 dark:text-gray-400 dark:ring-gray-400/20',
        orange:
          'bg-orange-50 text-orange-900 ring-1 ring-orange-500/30 ring-inset dark:bg-orange-400/10 dark:text-orange-400 dark:ring-orange-400/20',

        // ── Status de agendamento ────────────────────────────────────────
        pending:
          'bg-yellow-50 text-yellow-900 ring-1 ring-yellow-600/30 ring-inset dark:bg-yellow-400/10 dark:text-yellow-500 dark:ring-yellow-400/20',
        waiting:
          'bg-sky-50 text-sky-900 ring-1 ring-sky-500/30 ring-inset dark:bg-sky-400/10 dark:text-sky-400 dark:ring-sky-400/30',
        confirmed:
          'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-600/30 ring-inset dark:bg-emerald-400/10 dark:text-emerald-400 dark:ring-emerald-400/20',
        completed:
          'bg-green-50 text-green-900 ring-1 ring-green-600/30 ring-inset dark:bg-green-400/10 dark:text-green-400 dark:ring-green-400/20',
        in_progress:
          'bg-indigo-50 text-indigo-900 ring-1 ring-indigo-500/30 ring-inset dark:bg-indigo-400/10 dark:text-indigo-400 dark:ring-indigo-400/30',
        no_show:
          'bg-red-50 text-red-900 ring-1 ring-red-600/20 ring-inset dark:bg-red-400/10 dark:text-red-400 dark:ring-red-400/20',
        canceled:
          'bg-slate-50 text-slate-900 ring-1 ring-slate-500/20 ring-inset dark:bg-slate-400/10 dark:text-slate-400 dark:ring-slate-400/20',
        canceled_by_patient:
          'bg-orange-50 text-orange-900 ring-1 ring-orange-500/30 ring-inset dark:bg-orange-400/10 dark:text-orange-400 dark:ring-orange-400/30',
        canceled_by_professional:
          'bg-amber-50 text-amber-900 ring-1 ring-amber-500/30 ring-inset dark:bg-amber-400/10 dark:text-amber-400 dark:ring-amber-400/30',

        // ── Status financeiro ────────────────────────────────────────────
        partial:
          'bg-lime-50 text-lime-900 ring-1 ring-lime-500/30 ring-inset dark:bg-lime-400/10 dark:text-lime-400 dark:ring-lime-400/20',
        paid: 'bg-teal-50 text-teal-900 ring-1 ring-teal-500/30 ring-inset dark:bg-teal-400/10 dark:text-teal-400 dark:ring-teal-400/20',
        refund:
          'bg-cyan-50 text-cyan-900 ring-1 ring-cyan-500/30 ring-inset dark:bg-cyan-400/10 dark:text-cyan-400 dark:ring-cyan-400/30',

        // ── Cores diretas ────────────────────────────────────────────────
        red: 'bg-red-50 text-red-900 ring-1 ring-red-600/20 ring-inset dark:bg-red-400/10 dark:text-red-400 dark:ring-red-400/20',
        amber:
          'bg-amber-50 text-amber-900 ring-1 ring-amber-500/30 ring-inset dark:bg-amber-400/10 dark:text-amber-400 dark:ring-amber-400/20',
        yellow:
          'bg-yellow-50 text-yellow-900 ring-1 ring-yellow-600/30 ring-inset dark:bg-yellow-400/10 dark:text-yellow-500 dark:ring-yellow-400/20',
        lime: 'bg-lime-50 text-lime-900 ring-1 ring-lime-500/30 ring-inset dark:bg-lime-400/10 dark:text-lime-400 dark:ring-lime-400/20',
        green:
          'bg-green-50 text-green-900 ring-1 ring-green-600/30 ring-inset dark:bg-green-400/10 dark:text-green-400 dark:ring-green-400/20',
        emerald:
          'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-600/30 ring-inset dark:bg-emerald-400/10 dark:text-emerald-400 dark:ring-emerald-400/20',
        teal: 'bg-teal-50 text-teal-900 ring-1 ring-teal-500/30 ring-inset dark:bg-teal-400/10 dark:text-teal-400 dark:ring-teal-400/20',
        cyan: 'bg-cyan-50 text-cyan-900 ring-1 ring-cyan-500/30 ring-inset dark:bg-cyan-400/10 dark:text-cyan-400 dark:ring-cyan-400/30',
        sky: 'bg-sky-50 text-sky-900 ring-1 ring-sky-500/30 ring-inset dark:bg-sky-400/10 dark:text-sky-400 dark:ring-sky-400/30',
        blue: 'bg-blue-50 text-blue-900 ring-1 ring-blue-500/30 ring-inset dark:bg-blue-400/10 dark:text-blue-400 dark:ring-blue-400/30',
        indigo:
          'bg-indigo-50 text-indigo-900 ring-1 ring-indigo-500/30 ring-inset dark:bg-indigo-400/10 dark:text-indigo-400 dark:ring-indigo-400/30',
        violet:
          'bg-violet-50 text-violet-900 ring-1 ring-violet-500/30 ring-inset dark:bg-violet-400/10 dark:text-violet-400 dark:ring-violet-400/30',
        purple:
          'bg-purple-50 text-purple-900 ring-1 ring-purple-500/30 ring-inset dark:bg-purple-400/10 dark:text-purple-400 dark:ring-purple-400/30',
        fuchsia:
          'bg-fuchsia-50 text-fuchsia-900 ring-1 ring-fuchsia-500/30 ring-inset dark:bg-fuchsia-400/10 dark:text-fuchsia-400 dark:ring-fuchsia-400/20',
        pink: 'bg-pink-50 text-pink-900 ring-1 ring-pink-500/30 ring-inset dark:bg-pink-400/10 dark:text-pink-400 dark:ring-pink-400/20',
        rose: 'bg-rose-50 text-rose-900 ring-1 ring-rose-500/30 ring-inset dark:bg-rose-400/10 dark:text-rose-400 dark:ring-rose-400/20',
        slate:
          'bg-slate-50 text-slate-900 ring-1 ring-slate-500/20 ring-inset dark:bg-slate-400/10 dark:text-slate-400 dark:ring-slate-400/20',
        stone:
          'bg-stone-50 text-stone-900 ring-1 ring-stone-500/20 ring-inset dark:bg-stone-400/10 dark:text-stone-400 dark:ring-stone-400/20',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

// ─── Badge ───────────────────────────────────────────────────────────────────

function Badge({ className, variant, asChild = false, ...props }: BadgeProps) {
  const Comp = asChild ? Slot : 'span';
  return <Comp data-slot="badge" className={cn(badgeVars({ variant }), className)} {...props} />;
}

// ─── BadgeIndicator ───────────────────────────────────────────────────────────

const indicatorColorMap: Record<string, string> = {
  pending: 'bg-yellow-500',
  waiting: 'bg-sky-500',
  confirmed: 'bg-emerald-500',
  completed: 'bg-green-500',
  in_progress: 'bg-indigo-500',
  no_show: 'bg-red-500',
  canceled: 'bg-slate-500',
  canceled_by_patient: 'bg-orange-500',
  canceled_by_professional: 'bg-amber-500',
  partial: 'bg-lime-600',
  paid: 'bg-teal-500',
  refund: 'bg-purple-500',
  success: 'bg-emerald-500',
  active: 'bg-emerald-500',
  warning: 'bg-yellow-500',
  error: 'bg-red-500',
  info: 'bg-blue-500',
  neutral: 'bg-gray-500',
};

function Dot({ status, pulse, className }: { status: string; pulse?: boolean; className?: string }) {
  const color = indicatorColorMap[status] ?? 'bg-gray-400 dark:bg-gray-500';
  return (
    <span className={cn('relative flex size-2', className)}>
      {pulse && (
        <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-75', color)} />
      )}
      <span className={cn('relative inline-flex size-2 rounded-full', color)} />
    </span>
  );
}

function BadgeIndicator({
  className,
  variant = 'pending',
  pulse = false,
  asChild = false,
  children,
  ...props
}: BadgeIndicatorProps) {
  const Comp = asChild ? Slot : 'span';

  if (!children) return <Dot status={variant} pulse={pulse} className={className} />;

  return (
    <Comp data-slot="badge" className={cn(badgeVars({ variant: 'muted' }), className)} {...props}>
      <Dot status={variant} pulse={pulse} />
      {children}
    </Comp>
  );
}

// ─── BadgeWithDelta ───────────────────────────────────────────────────────────

function BadgeWithDelta({ className, delta, asChild = false, children, ...props }: BadgeWithDeltaProps) {
  const Comp = asChild ? Slot : 'span';
  const DeltaIcon =
    delta === 0 ? (
      <IconMinus className="size-3 stroke-2 text-sky-500" />
    ) : delta > 0 ? (
      <IconUp className="size-3 stroke-2 text-emerald-500" />
    ) : (
      <IconDown className="size-3 stroke-2 text-rose-500" />
    );

  return (
    <Comp data-slot="badge" className={cn(badgeVars({ variant: 'muted' }), className)} {...props}>
      {DeltaIcon}
      {children}
    </Comp>
  );
}

// ─── Status (badge1 pattern) ──────────────────────────────────────────────────

const Status = ({ className, status, ...props }: StatusProps) => (
  <Badge className={cn('group flex items-center gap-2', status, className)} variant={status} {...props} />
);

const StatusIndicator = ({ className, status, ...props }: StatusIndicatorProps) => {
  const color = status ? (indicatorColorMap[status] ?? '') : '';
  return (
    <span className="relative flex size-2" {...props}>
      <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-75', color)} />
      <span className={cn('relative inline-flex size-2 rounded-full', color)} />
    </span>
  );
};

const StatusLabel = ({ className, children, ...props }: StatusLabelProps) => (
  <span className={cn('text-current', className)} {...props}>
    {children}
  </span>
);

// ─── Exports ──────────────────────────────────────────────────────────────────

export { Badge, BadgeIndicator, BadgeWithDelta, badgeVars, Status, StatusIndicator, StatusLabel };

// ─── Types ────────────────────────────────────────────────────────────────────

type ScheduleStatus =
  | 'pending'
  | 'waiting'
  | 'confirmed'
  | 'completed'
  | 'in_progress'
  | 'no_show'
  | 'canceled'
  | 'canceled_by_patient'
  | 'canceled_by_professional';
type FinancialStatus = 'pending' | 'partial' | 'paid' | 'refund' | 'canceled';
type SystemStatus = ScheduleStatus | FinancialStatus;
export type StatusVariant = 'success' | 'active' | 'warning' | 'pending' | 'error' | 'canceled' | 'info' | 'neutral';

type BadgeProps = ComponentProps<'span'> & VariantProps<typeof badgeVars> & { asChild?: boolean };

export type BadgeIndicatorProps = ComponentProps<'span'> & {
  variant?: SystemStatus;
  pulse?: boolean;
  asChild?: boolean;
  children?: ReactNode;
};

export type BadgeWithDeltaProps = ComponentProps<'span'> &
  VariantProps<typeof badgeVars> & {
    delta: number;
    asChild?: boolean;
    children: ReactNode;
  };

export type StatusIndicatorProps = HTMLAttributes<HTMLSpanElement> & { status?: StatusVariant };
export type StatusProps = ComponentProps<typeof Badge> & { status: StatusVariant };
export type StatusLabelProps = HTMLAttributes<HTMLSpanElement>;
