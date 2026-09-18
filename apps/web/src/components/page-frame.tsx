import type * as React from 'react';
import { cn } from '@/lib/utils.js';

// A coluna centralizada com as réguas tracejadas nas laterais — a moldura de
// "papel quadriculado" do app. Só desenha a partir de `xl` (1280px): abaixo
// disso não existe chrome de borda nenhum, nem esta moldura nem o ring do
// Card (components/ui/card.tsx). O `xl:px-6` é obrigatório — sem ele o ring
// do Card encosta exatamente na linha tracejada e a moldura passa a ler como
// sólida em cima e tracejada embaixo.
//
// MobileDock nunca entra aqui: é `fixed` e ocupa a largura toda, então fica
// como irmão em routes/_private.tsx.
export function PageFrame({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="page-frame"
      className={cn('mx-auto min-h-dvh w-full max-w-7xl border-dashed xl:border-x', className)}
      {...props}
    />
  );
}
