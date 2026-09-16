# separator

2026-09-16, transformation engine (direct 1:1 mapping per universal-patterns.md), verdict: clean, no behavior change.

## Changed

- `src/components/ui/separator.tsx` — swapped `import * as SeparatorPrimitive from '@radix-ui/react-separator'` for `import { Separator as SeparatorPrimitive } from '@base-ui/react/separator'`. Separator is single-part/callable in Base UI, so `<SeparatorPrimitive.Root>` became `<SeparatorPrimitive>` and the type changed from `ComponentProps<typeof SeparatorPrimitive.Root>` to `SeparatorPrimitive.Props`. Dropped the `decorative` prop (removed from Base UI's Separator entirely — verified in `node_modules/@base-ui/react/separator/Separator.d.ts`, no `decorative` field on `SeparatorProps`).
  Verified Base UI's Separator still emits the plain `data-orientation="horizontal"|"vertical"` attribute (`node_modules/@base-ui/react/separator/SeparatorDataAttributes.d.ts`), identical to Radix, so the existing `data-[orientation=horizontal]:h-px` class selectors needed no rewrite — this is NOT the `data-[state=]` style attribute the class-mapping doc's rewrite table covers.
  Leftover scan: `grep -n "radix-ui\|@radix-ui" separator.tsx` → no matches.

## Left alone

- `item.tsx` imports `Separator` by wrapper name only (`@/components/ui/separator.js`) and never touched `SeparatorPrimitive` directly or the `decorative` prop — no consumer changes needed.

## Behavior changes

- `decorative` prop silently dropped. No caller in this project ever passed it (grep across `apps/web/src` found no `decorative` usage), so this is inert here, but flagging per the hard rule: if a future caller passes `decorative`, it will be forwarded onto the DOM node as an unknown attribute rather than affecting `role`/`aria-hidden`.

## Verify by hand

- Open any page using `<Item>` rows (e.g. a details page) and confirm the horizontal rule between items still renders at 1px with the correct border color, both orientations if used.
