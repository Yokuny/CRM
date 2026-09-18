import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';
import type * as React from 'react';

import { Separator } from '@/components/ui/separator.js';

// O container tracejado é o que apresenta onde os Items estão sendo
// renderizados (apps/web/CLAUDE.md: Item/ItemGroup é o agrupador padrão) —
// mesma linguagem da moldura de página em routes/_private.tsx. Sem `gap`: as
// linhas divisórias só encostam nos itens se eles forem adjacentes. As
// divisórias não usam `divide-*`: o Tailwind 4 emite essas regras dentro de
// `:where()` (especificidade 0) e qualquer `border-*` no filho as venceria.
//
// As linhas são SEMPRE responsabilidade do grupo, nunca da página: por isso o
// Item não traz utilitário de borda nenhum (nem `border`, nem `border-0`) —
// sem utilitário no filho não há empate de especificidade com estes seletores
// `[&>*]`, e a ordem das regras no CSS deixa de importar.
// `bg-card`: o grupo é conteúdo, então sobe do canvas (#f3f1f3) pro branco —
// sem isso o contêiner some na tela e só as linhas tracejadas o denunciam.
const itemGroupVariants = cva('group/item-group w-full border border-dashed border-border/60 bg-card', {
  variants: {
    variant: {
      // Pilha vertical: divisória tracejada entre itens adjacentes.
      stack:
        'flex flex-col [&>*:not(:first-child)]:border-t [&>*:not(:first-child)]:border-dashed [&>*:not(:first-child)]:border-border/60',
      // Grade de navegação (hubs de seção). Cada célula desenha só as linhas
      // internas (direita/baixo); o -mr/-mb-px faz a borda da última coluna/
      // linha cair em cima da moldura do container em vez de dobrar com ela.
      grid: 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 [&>*]:-mr-px [&>*]:-mb-px [&>*]:border-r [&>*]:border-b [&>*]:border-dashed [&>*]:border-border/60',
    },
  },
  defaultVariants: {
    variant: 'stack',
  },
});

function ItemGroup({
  className,
  variant = 'stack',
  ...props
}: React.ComponentProps<'ul'> & VariantProps<typeof itemGroupVariants>) {
  return (
    <ul
      data-slot="item-group"
      data-variant={variant}
      className={cn(itemGroupVariants({ variant, className }))}
      {...props}
    />
  );
}

// Bloco de conteúdo dentro de uma página (painel do inbox, painel de
// agendamento/bloqueio, editor de horários, blocos do kanban). Mesma moldura
// tracejada do ItemGroup, mas com padding e sem divisórias — é um contêiner de
// composição livre, não uma lista. Existe pra que nenhuma rota precise
// escrever `<div className="rounded-md border p-4">` à mão.
//
// O Panel cuida só da moldura e da densidade; o arranjo interno (grid, linha,
// alinhamento) continua sendo className do caller — isso é layout local, não
// identidade visual. `render` (mesma API do Item) cobre os casos em que o
// painel é outro elemento, tipicamente um <form>.
const panelVariants = cva('flex w-full flex-col rounded-none border border-dashed border-border/60 bg-card', {
  variants: {
    size: {
      default: 'gap-4 p-4',
      sm: 'gap-3 p-3',
      xs: 'gap-2 p-2',
    },
  },
  defaultVariants: {
    size: 'default',
  },
});

function Panel({
  className,
  size = 'default',
  render,
  ...props
}: useRender.ComponentProps<'div'> & VariantProps<typeof panelVariants>) {
  return useRender({
    defaultTagName: 'div',
    props: mergeProps<'div'>({ className: cn(panelVariants({ size, className })) }, props),
    render,
    state: { slot: 'panel', size },
  });
}

function ItemSeparator({ className, ...props }: React.ComponentProps<typeof Separator>) {
  return <Separator data-slot="item-separator" orientation="horizontal" className={cn('my-2', className)} {...props} />;
}

const itemVariants = cva(
  'group/item flex w-full flex-wrap items-center rounded-none text-xs transition-colors duration-100 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [a]:transition-colors [a]:hover:bg-accent [a]:hover:text-accent-foreground',
  {
    variants: {
      variant: {
        // Sem utilitário de borda nenhum, de propósito: as linhas vêm do
        // ItemGroup (`[&>*]:border-r` etc.). Um `border-0` aqui empataria em
        // especificidade com esses seletores e a ordem no CSS decidiria quem
        // ganha — sem nada no filho, o grupo manda sozinho.
        default: '',
        // Célula de grid avulsa, fora de um `ItemGroup variant="grid"`: mesmo
        // desenho, só que auto-suficiente.
        outline: '-mr-px -mb-px border-r border-b border-dashed border-border/60',
        // Só o DefaultEmptyData usa: um "vão" esperando conteúdo, então fica
        // num cinza abaixo do canvas em vez de subir pro --card como o
        // conteúdo de verdade.
        muted: 'bg-muted/60',
      },
      size: {
        default: 'gap-2.5 px-3 py-2.5',
        sm: 'gap-2.5 px-3 py-2.5',
        xs: 'gap-2 px-2.5 py-2 in-data-[slot=dropdown-menu-content]:p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Item({
  className,
  variant = 'default',
  size = 'default',
  render,
  ...props
}: useRender.ComponentProps<'li'> & VariantProps<typeof itemVariants>) {
  return useRender({
    defaultTagName: 'li',
    props: mergeProps<'li'>(
      {
        className: cn(itemVariants({ variant, size, className })),
      },
      props,
    ),
    render,
    state: {
      slot: 'item',
      variant,
      size,
    },
  });
}

const itemMediaVariants = cva(
  'flex shrink-0 items-center justify-center gap-2 group-has-data-[slot=item-description]/item:translate-y-0.5 group-has-data-[slot=item-description]/item:self-start [&_svg]:pointer-events-none',
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        // Ladrilho menta com o ícone na cor de ação: é o que dá cor aos hubs
        // de navegação. Quando o Item é um link, o hover do link inverte o
        // ladrilho pra verde sólido — a única resposta de hover que muda de
        // valor, não só de matiz, então lê como "clicável" mesmo em tela ruim.
        icon: "size-8 bg-secondary text-primary transition-colors [a:hover_&]:bg-primary [a:hover_&]:text-primary-foreground [&_svg:not([class*='size-'])]:size-4",
        image:
          'size-10 overflow-hidden rounded-none group-data-[size=sm]/item:size-8 group-data-[size=xs]/item:size-6 [&_img]:size-full [&_img]:object-cover',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function ItemMedia({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof itemMediaVariants>) {
  return (
    <div
      data-slot="item-media"
      data-variant={variant}
      className={cn(itemMediaVariants({ variant, className }))}
      {...props}
    />
  );
}

function ItemContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="item-content"
      className={cn(
        'flex flex-1 flex-col gap-1 group-data-[size=xs]/item:gap-0 [&+[data-slot=item-content]]:flex-none',
        className,
      )}
      {...props}
    />
  );
}

function ItemTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="item-title"
      className={cn('line-clamp-1 flex w-fit items-center gap-2 text-xs font-medium underline-offset-4', className)}
      {...props}
    />
  );
}

function ItemDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="item-description"
      className={cn(
        'line-clamp-2 text-left text-xs/relaxed font-normal text-muted-foreground group-data-[size=xs]/item:text-xs/relaxed [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary',
        className,
      )}
      {...props}
    />
  );
}

function ItemActions({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="item-actions" className={cn('flex items-center gap-2', className)} {...props} />;
}

function ItemHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="item-header"
      className={cn('flex basis-full items-center justify-between gap-2', className)}
      {...props}
    />
  );
}

function ItemFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="item-footer"
      className={cn('flex basis-full items-center justify-between gap-2', className)}
      {...props}
    />
  );
}

export {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemHeader,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
  Panel,
};
