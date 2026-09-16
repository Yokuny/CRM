import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';

import { cn } from '@/lib/utils.js';

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn('flex w-full flex-col gap-2', className)} {...props} />;
}

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        'relative flex h-auto w-full select-none items-center justify-start border-border border-b bg-transparent p-0',
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        // Base layout
        'relative z-10 inline-flex h-10 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-none px-0 py-2 md:px-4',
        // Typography — font-mono para seguir o design system
        'font-medium font-mono text-sm leading-5',
        // Inactive state
        'border-0 bg-transparent text-muted-foreground outline-none',
        // Hover highlight
        'transition-colors duration-200',
        'hover:text-foreground',
        // Hover background pill
        'before:absolute before:inset-x-0.5 before:inset-y-0.5 before:rounded-xs before:bg-transparent before:transition-all before:duration-200',
        'hover:before:bg-muted/50',
        // Active state — texto visível, remove bg pill, mantém underline via after
        'data-active:bg-transparent data-active:text-foreground data-active:shadow-none',
        'data-active:before:bg-transparent',
        // Active underline indicator
        'after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-full',
        'after:origin-left after:scale-x-0 after:bg-primary after:transition-transform after:duration-300 after:ease-out',
        'data-active:after:scale-x-100',
        // Focus visible
        'focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0',
        // Disabled
        'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
        // SVG inside
        "[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn('w-full flex-1 outline-none', 'fade-in-50 animate-in duration-500', className)}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
