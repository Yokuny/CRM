import { cn } from 'cn';
import type * as React from 'react';

// Grades do calendário da agenda (visões de dia/semana e de mês). Mesma
// linguagem tracejada de item.tsx: a moldura e TODAS as linhas internas vêm
// daqui, a rota só compõe e passa layout (largura mínima, colunas, posição).
// Cada linha interna é desenhada uma única vez por quem está depois dela
// (célula da direita / de baixo) e as linhas de borda caem na própria
// moldura — nunca uma célula com borda nos quatro lados, que dobraria a
// linha entre duas vizinhas. Como em ItemGroup, os filhos diretos cujas
// linhas vêm do pai não trazem utilitário de borda nenhum (nem `border-0`):
// empataria em especificidade com os seletores `[&>*]` e a ordem no CSS
// decidiria quem pinta.

// Moldura da grade por hora. Rola na horizontal em tela estreita; `className`
// vai pro conteúdo interno (tipicamente a largura mínima).
function CalendarTimeGrid({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className="w-full overflow-x-auto border border-dashed border-border/60 bg-card">
      <div data-slot="calendar-time-grid" className={cn('flex', className)} {...props} />
    </div>
  );
}

// Colunas de dia lado a lado, com linha vertical à esquerda de cada uma — a
// primeira separa a coluna de horas, a última encosta na moldura.
function CalendarTimeGridColumns({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="calendar-time-grid-columns"
      className={cn('grid flex-1 [&>*]:border-l [&>*]:border-dashed [&>*]:border-border/60', className)}
      {...props}
    />
  );
}

// Cabeçalho de uma coluna (dia da semana/data) — e o espaçador em cima da
// coluna de horas, pra linha de baixo atravessar a grade inteira.
function CalendarTimeGridHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="calendar-time-grid-header"
      className={cn(
        'flex h-10 flex-col items-center justify-center border-b border-dashed border-border/60 text-center',
        className,
      )}
      {...props}
    />
  );
}

// Linha de uma hora dentro do corpo de uma coluna (posicionada pelo caller
// via `style.top`). A hora 00 não leva linha: o cabeçalho já desenha essa.
function CalendarTimeGridHourLine({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="calendar-time-grid-hour-line"
      aria-hidden
      className={cn('pointer-events-none absolute inset-x-0 border-t border-dashed border-border/60', className)}
      {...props}
    />
  );
}

// Grade de mês: 7 colunas, cabeçalho de dias da semana + células. Linha à
// direita de toda célula que não fecha a linha (7n) e em cima de toda célula
// da segunda linha em diante (n+8).
function CalendarMonthGrid({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="calendar-month-grid"
      className={cn(
        'grid w-full grid-cols-7 border border-dashed border-border/60 bg-card',
        '[&>*:not(:nth-child(7n))]:border-r [&>*:nth-child(n+8)]:border-t [&>*]:border-dashed [&>*]:border-border/60',
        className,
      )}
      {...props}
    />
  );
}

// Célula de um dia na grade de mês; `outside` esmaece os dias do mês
// anterior/seguinte que completam a primeira/última semana.
function CalendarMonthCell({ className, outside, ...props }: React.ComponentProps<'div'> & { outside?: boolean }) {
  return (
    <div
      data-slot="calendar-month-cell"
      className={cn('flex min-h-24 flex-col gap-1 p-1', outside && 'bg-muted/40 text-muted-foreground', className)}
      {...props}
    />
  );
}

export {
  CalendarMonthCell,
  CalendarMonthGrid,
  CalendarTimeGrid,
  CalendarTimeGridColumns,
  CalendarTimeGridHeader,
  CalendarTimeGridHourLine,
};
