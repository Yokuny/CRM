import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils.js';

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;

// Base UI's Popover has no Anchor part at all (verified: not in
// @base-ui/react/popover's index.parts.d.ts) — positioning an anchor other
// than the trigger is done via Positioner's `anchor` prop instead. No
// consumer in this app uses PopoverAnchor; kept as an inert passthrough
// (per the migration's hard rule for parts with no equivalent) so the
// export doesn't disappear out from under a future caller.
function PopoverAnchor({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

function PopoverContent({
  className,
  align = 'center',
  sideOffset = 4,
  ...props
}: PopoverPrimitive.Popup.Props & Pick<PopoverPrimitive.Positioner.Props, 'align' | 'sideOffset'>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner align={align} sideOffset={sideOffset} className="isolate z-50">
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            'z-50 w-screen max-w-xs rounded-md border border-border bg-popover text-popover-foreground outline-hidden p-4',
            'data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-closed:animate-out data-open:animate-in',
            'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger };
