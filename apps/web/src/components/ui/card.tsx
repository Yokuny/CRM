import { Link, useLocation, useMatches, useRouter } from '@tanstack/react-router';
import { cn } from 'cn';
import { ArrowLeft as ArrowLeftIcon, Home as HomeIcon } from 'lucide-react';
import * as React from 'react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb.js';
import { UserMenu } from '@/components/user-menu.js';
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
        'group/card flex min-h-dvh flex-col gap-(--card-spacing) overflow-hidden rounded-none   py-(--card-spacing) pb-24 text-xs/relaxed text-card-foreground [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-none *:[img:last-child]:rounded-none',
        className,
      )}
      {...props}
    >
      {asPage && (
        // Faixa de navegação da página: única superfície --card de largura
        // total, encostada no topo (o -mt anula o py do Card) — separa "onde
        // estou" (breadcrumb + menu) do conteúdo, que fica no canvas.
        <div className="-mt-(--card-spacing) flex items-center justify-between border-border/60 border-b border-dashed px-(--card-spacing) py-(--card-spacing)">
          <PageBreadcrumb />
          <UserMenu />
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
        'group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-none px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-(--card-spacing)',
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

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
      {...props}
    />
  );
}

// Empilhar com `gap-4` é o que praticamente toda página quer — era isso que
// cada rota repetia como `className="flex flex-col gap-4"`. Vira o default;
// quem precisa de outro layout (ex.: inbox, grid de 2 colunas) sobrescreve
// via className, que aí é layout local e não identidade visual.
function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="card-content" className={cn('flex flex-col gap-4 px-(--card-spacing)', className)} {...props} />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        'flex items-center rounded-none border-border/60 border-t border-dashed p-(--card-spacing)',
        className,
      )}
      {...props}
    />
  );
}

export { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle };
