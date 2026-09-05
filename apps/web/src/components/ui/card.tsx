import { Link, useLocation, useMatches, useRouter } from '@tanstack/react-router';
import { type ComponentProps, Fragment } from 'react';
import ArrowLeftIcon from '@/components/icons/Back.Icon.js';
import HelpIcon from '@/components/icons/Help.Icon.js';
import { HomeIcon } from '@/components/icons/Home.Icon.js';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';
import { t } from '@/lib/helpers/translate.helper.js';
import { cn } from '@/lib/utils.js';
import { Button } from './button.js';

function PageBreadcrumb() {
  const matches = useMatches();
  const location = useLocation();
  const pathnames = location.pathname.split('/').filter(Boolean);

  if (pathnames.length === 0) return null;

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link to="/">
              <HomeIcon className="size-4" />
            </Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {pathnames.length > 0 && <BreadcrumbSeparator />}
        {pathnames.map((value, index) => {
          const isLast = index === pathnames.length - 1;
          const to = `/${pathnames.slice(0, index + 1).join('/')}`;
          const match = matches.find((m) => m.pathname === to || m.pathname === `${to}/`);
          let translatedValue = '';
          if (match?.staticData) {
            if (typeof match.staticData.getTitle === 'function') {
              translatedValue = match.staticData.getTitle();
            } else if (typeof match.staticData.title === 'string') {
              translatedValue = match.staticData.title;
            }
          }
          if (!translatedValue) translatedValue = t(value);
          return (
            <Fragment key={to}>
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{translatedValue}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={to as string}>{translatedValue}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function Card({ className, asPage, children, ...props }: ComponentProps<'div'> & { asPage?: boolean }) {
  return (
    <div
      data-slot="card"
      className={cn(
        'flex h-full flex-col gap-6 rounded-lg border bg-background py-6 pb-24 text-card-foreground md:py-6',
        className,
      )}
      {...props}
    >
      {asPage && (
        <div className="-mb-2 flex items-center justify-between px-4 md:px-6">
          <PageBreadcrumb />
          <CardDescription />
        </div>
      )}
      {children}
    </div>
  );
}

function CardHeader({ className, title, children, ...props }: ComponentProps<'div'> & { title?: string }) {
  const location = useLocation();
  const matches = useMatches();
  const router = useRouter();

  const getTitle = (title: string | undefined) => {
    if (title) return title;
    for (let i = matches.length - 1; i >= 0; i--) {
      const match = matches[i];
      if (match?.staticData) {
        if (typeof match.staticData.getTitle === 'function') return match.staticData.getTitle();
        if (typeof match.staticData.title === 'string') return match.staticData.title;
      }
    }
    const pathnames = location.pathname.split('/').filter(Boolean);
    if (pathnames.length > 0) return t(pathnames[pathnames.length - 1]);
  };

  const resolvedTitle = getTitle(title);

  return (
    <div
      data-slot="card-header"
      className={cn('flex items-start justify-between gap-2 px-4 sm:items-center md:px-6', className)}
      {...props}
    >
      <div className="flex items-center gap-2 md:gap-4">
        <Button size="icon" className="md:px-6" onClick={() => router.history.back()}>
          <ArrowLeftIcon />
        </Button>
        {resolvedTitle && <CardTitle>{resolvedTitle}</CardTitle>}
      </div>
      {children}
    </div>
  );
}

function CardTitle({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn('font-mono font-semibold text-2xl leading-none tracking-tight md:text-3xl', className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: ComponentProps<'div'>) {
  const matches = useMatches();
  let description = '';
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    if (match?.staticData && typeof match.staticData.description === 'string') {
      description = match.staticData.description;
      break;
    }
  }
  if (!description) return null;
  return (
    <div data-slot="card-description" className={cn('flex items-center text-muted-foreground', className)} {...props}>
      <Tooltip>
        <TooltipTrigger type="button" className="cursor-help transition-colors hover:text-foreground">
          <HelpIcon className="size-5" />
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-xs font-normal">
          <p>{description}</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function CardAction({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        'col-start-2 row-span-2 row-start-1 flex w-full justify-end gap-2 sm:w-auto sm:flex-row',
        className,
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('px-2 md:px-6', className)} {...props} />;
}

function CardFooter({ className, layout = 'simple', ...props }: CardFooterProps) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        'flex gap-4 px-4 md:px-6 [.border-t]:pt-6',
        layout === 'simple' && 'items-center justify-end',
        layout === 'multi' && 'flex-col items-center justify-between sm:flex-row',
        className,
      )}
      {...props}
    />
  );
}

export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };

interface CardFooterProps extends ComponentProps<'div'> {
  layout?: 'simple' | 'multi';
}
