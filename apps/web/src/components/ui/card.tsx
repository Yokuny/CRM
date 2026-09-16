import { Link, useLocation, useMatches, useRouter } from '@tanstack/react-router';
import { cn } from 'cn';
import { ArrowLeft as ArrowLeftIcon, HelpCircle as HelpIcon, Home as HomeIcon } from 'lucide-react';
import * as React from 'react';
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
import { Button } from './button.js';

function PageBreadcrumb() {
  const matches = useMatches();
  const location = useLocation();
  const pathnames = location.pathname.split('/').filter(Boolean);

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink
            render={
              <Link to="/">
                <HomeIcon className="size-4" />
              </Link>
            }
          />
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
            <React.Fragment key={to}>
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{translatedValue}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink render={<Link to={to as string}>{translatedValue}</Link>} />
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function Card({
  className,
  size = 'default',
  asPage,
  children,
  ...props
}: React.ComponentProps<'div'> & { size?: 'default' | 'sm'; asPage?: boolean }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        'group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-none bg-card py-(--card-spacing) pb-24 text-xs/relaxed text-card-foreground ring-1 ring-foreground/10 [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-none *:[img:last-child]:rounded-none',
        className,
      )}
      {...props}
    >
      {asPage && (
        <div className="-mb-2 flex items-center justify-between px-(--card-spacing)">
          <PageBreadcrumb />
          <CardDescription />
        </div>
      )}
      {children}
    </div>
  );
}

function CardHeader({ className, title, children, ...props }: React.ComponentProps<'div'> & { title?: string }) {
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
      className={cn(
        'group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-none px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)',
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-2 md:gap-4">
        <Button variant="basic" onClick={() => router.history.back()}>
          <ArrowLeftIcon />
        </Button>
        {resolvedTitle && <CardTitle>{resolvedTitle}</CardTitle>}
      </div>
      {children}
    </div>
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn('text-sm font-medium group-data-[size=sm]/card:text-sm', className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
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

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('px-(--card-spacing)', className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center rounded-none border-t p-(--card-spacing)', className)}
      {...props}
    />
  );
}

export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
