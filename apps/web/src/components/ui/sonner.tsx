import type { CSSProperties } from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

// Simplificado em relação à referência: sem next-themes (projeto não tem
// requisito de dark/light toggle, spec.md) nem useIsMobile (sem hook de
// breakpoint ainda portado) — theme fixo 'light' e uma posição única, em vez
// da alternância mobile/desktop do original.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      swipeDirections={['top', 'bottom'] as ToasterProps['swipeDirections']}
      position="bottom-right"
      style={
        {
          '--normal-bg': 'var(--background)',
          '--normal-text': 'var(--foreground)',
          '--normal-border': 'var(--border)',
        } as CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
