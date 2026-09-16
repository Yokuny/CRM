# scroll-area

2026-09-16, transformation engine (direct rename mapping per universal-patterns.md / display-misc.md), verdict: clean, one call-site prop dropped (flagged).

## Changed

- `src/components/ui/scroll-area.tsx` — swapped `import { ScrollArea as ScrollAreaPrimitive } from 'radix-ui'` for `import { ScrollArea as ScrollAreaPrimitive } from '@base-ui/react/scroll-area'`. Types changed from `ComponentProps<typeof ScrollAreaPrimitive.Root>` / `ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>` to `ScrollAreaPrimitive.Root.Props` / `ScrollAreaPrimitive.Scrollbar.Props` (per universal-patterns.md type rule); dropped the now-unused `import type { ComponentProps } from 'react'`.
  Part renames only: `ScrollAreaPrimitive.ScrollAreaScrollbar` → `ScrollAreaPrimitive.Scrollbar` (line 18), `ScrollAreaPrimitive.ScrollAreaThumb` → `ScrollAreaPrimitive.Thumb` (line 29). `Root`, `Viewport`, `Corner` keep the same names on both libraries, no change beyond the import source. No className/data-attribute rewrites were needed: the wrapper drives scrollbar layout with a plain `orientation === 'vertical' | 'horizontal'` JS ternary (not a `data-[state=…]` selector), which is untouched by the Radix→Base UI data-attribute mapping.
  Verified `ScrollAreaPrimitive.Corner`, `.Scrollbar`, `.Thumb` all exist in `node_modules/@base-ui/react/scroll-area/index.parts.d.ts` before making the rename.
- `src/components/ui/kanban.tsx:241` — removed `type="scroll"` from the horizontal board `<ScrollArea>` call site. `ScrollArea.Root.Props` in `@base-ui/react/scroll-area` (checked `node_modules/@base-ui/react/scroll-area/root/ScrollAreaRoot.d.ts`) has no `type` prop at all; visibility is CSS-driven in Base UI (`data-hovering`/`data-scrolling`/`data-has-overflow-*`), so the prop would have been a TS error and a silently-ignored DOM attribute if left in place.
  Leftover scan: `grep -n "radix-ui\|@radix-ui" scroll-area.tsx` → no matches.

## Left alone

- The vertical `<ScrollArea>` inside `KanbanCards` (`kanban.tsx:112`) never passed a `type` prop, so no change was needed there.
- No CSS in `src/index.css` targets scroll-area visibility states (`data-scrolling`, `data-hovering`, etc.), so no new styling was added for the dropped `type="scroll"` behavior — see Behavior changes below.

## Behavior changes

- FLAG: `type="scroll"` (Radix: scrollbar visible only while actively scrolling, plus a short fade-out delay) has no Base UI equivalent and was removed from `kanban.tsx`'s horizontal board scroll area. Base UI scrollbars are simply mounted whenever the content overflows (its `"auto"` mount behavior) and stay visible via this project's existing static `bg-border`/border classes — there is no opacity/fade transition wired up on either side of the migration, so the practical visual difference should be minimal (the horizontal kanban scrollbar was already effectively always-visible-when-overflowing before this change, since the wrapper never styled `[data-state=hidden]` for the fade). Still calling this out per the hard rule since the prop's semantics are gone, not silently reproduced.

## Verify by hand

- Kanban board (`/kanban`): confirm the horizontal scrollbar at the bottom of the columns still appears when there are more columns than fit on screen, and that dragging it scrolls the board.
- Kanban column cards list: confirm the per-column vertical scrollbar still appears once a column has more cards than fit in `max-h-[calc(100vh-16rem)]`, and that it scrolls independently of the board's horizontal scroll.
- Drag a card near the edge of the board and confirm the horizontal auto-scroll/scrollbar drag still feels the same as before.
