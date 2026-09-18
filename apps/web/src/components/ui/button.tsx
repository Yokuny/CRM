import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';

const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center rounded-none border border-transparent bg-clip-padding text-xs font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Hover escurece (bg-primary-hover, index.css) em vez de `primary/80`: a
        // transparência deixava o canvas cinza vazar e o verde ficava lavado.
        default: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        outline:
          'border-input bg-card hover:border-ring hover:bg-accent hover:text-accent-foreground aria-expanded:border-ring aria-expanded:bg-accent aria-expanded:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary-hover aria-expanded:bg-secondary-hover',
        ghost:
          'hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent aria-expanded:text-accent-foreground',
        destructive:
          'bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40',
        link: 'text-primary underline-offset-4 hover:underline',
        // Apesar do nome, é o estado SELECIONADO de um filtro segmentado
        // (`variant={ativo ? 'primary' : 'basic'}` em pedidos e inbox). Tem de
        // ser o segmento mais forte do grupo: menta + tinta verde + barra
        // inferior na cor de ação. A barra é box-shadow inset, não borda,
        // porque o ButtonGroup remove a border-l dos segmentos do meio.
        primary:
          'border border-input bg-secondary font-medium text-secondary-foreground shadow-[inset_0_-2px_0_var(--color-primary)] hover:bg-secondary-hover',
        // O botão secundário do app (voltar, paginação, menu do usuário,
        // "Adicionar"/"Editar" de cabeçalho — 39 usos). Branco (--card) sobre o
        // canvas com texto neutro, pra não competir com o `default`; o verde
        // só aparece na interação (menta + tinta verde + borda sálvia).
        basic:
          'border border-input bg-card text-foreground hover:border-ring hover:bg-accent hover:text-accent-foreground aria-expanded:border-ring aria-expanded:bg-accent aria-expanded:text-accent-foreground',
        info: 'border-none bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800',
        // "Aprovar" (pedidos/inbox). Era o emerald-600 do Tailwind (#009966),
        // um verde quase igual ao da marca — lado a lado com um botão
        // `default` parecia erro. Agora é a própria cor de ação da marca.
        success: 'border-none bg-primary text-primary-foreground hover:bg-primary-hover',
        blank: 'p-0!',
        financial:
          'justify-between border-input border-b-2 bg-transparent font-normal shadow-none ring-0 hover:bg-transparent dark:border-input dark:bg-transparent dark:hover:bg-transparent',
      },
      size: {
        default: 'h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        xs: "h-6 gap-1 rounded-none px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-none px-2.5 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        icon: 'size-8',
        'icon-xs': "size-6 rounded-none [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-7 rounded-none',
        'icon-lg': 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
