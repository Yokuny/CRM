# tabs

2026-09-16, transformation engine (golden-pair diff of `radix-sera`/`base-sera` tabs.json used to confirm the exact class-level transform, then replayed onto the project's existing customized markup), verdict: clean, one behavior delta flagged (not fixed) per the skill's explicit instruction to match the golden registry's own choice here.

## Changed

- `src/components/ui/tabs.tsx`
  - Import: `import * as TabsPrimitive from '@radix-ui/react-tabs'` → `import { Tabs as TabsPrimitive } from '@base-ui/react/tabs'`. Dropped the now-unused `import type { ComponentProps } from 'react'` (every prop type is now a primitive-specific `TabsPrimitive.<Part>.Props`, verified against the installed `@base-ui/react@1.8.0` `tabs/*/*.d.ts` files).
  - `Tabs` (Root→Root): prop type `ComponentProps<typeof TabsPrimitive.Root>` → `TabsPrimitive.Root.Props`. No other change — part name and behavior identical.
  - `TabsList` (List→List): prop type → `TabsPrimitive.List.Props`. Unchanged otherwise.
  - `TabsTrigger` (line ~23): primitive swapped `TabsPrimitive.Trigger` → `TabsPrimitive.Tab` (part rename, tabs' one Radix→Base UI structural rename besides Content→Panel); prop type → `TabsPrimitive.Tab.Props`.
    - Class rewrite: `data-[state=active]:bg-transparent`, `data-[state=active]:text-foreground`, `data-[state=active]:shadow-none`, `data-[state=active]:before:bg-transparent`, `data-[state=active]:after:scale-x-100` → `data-active:*` equivalents (Base UI's Tab exposes `data-active` as a presence attribute instead of Radix's `data-state="active"` value attribute).
    - Added `aria-disabled:pointer-events-none aria-disabled:opacity-50` alongside the existing `disabled:pointer-events-none disabled:opacity-50` — per class-mapping.md, Base UI's `Tabs.Tab` surfaces disabled state via `aria-disabled` rather than the native `disabled` attribute; confirmed this exact addition against the golden-pair diff, which made the identical change.
  - `TabsContent` (Content→Panel): primitive swapped `TabsPrimitive.Content` → `TabsPrimitive.Panel`; prop type → `TabsPrimitive.Panel.Props`. className string unchanged (no `data-state` selectors present there).
  - Leftover scan: `grep -n "radix-ui\|@radix-ui" tabs.tsx` → no matches.

## Left alone

- No consumer in `apps/web/src` imports from `tabs.tsx` outside the file itself — zero call-site changes needed.
- Did not add `activateOnFocus` to `TabsList` (see Behavior changes below) — matching wrapper-shapes.md's explicit instruction for this exact component ("the base registry accepts Base UI's manual-activation default ... flag the behavior delta, do not patch it").
- Did not forward `orientation` any differently than the original did (it already only flows through via `...props` spread on `Tabs`/`TabsList`, unaffected by the migration).
- `components.json` / `package.json` not touched.

## Behavior changes

- **Keyboard tab activation changes from automatic to manual.** Radix `Tabs` defaulted `activationMode="automatic"` (arrow-key focus immediately activates the newly-focused tab). Base UI's `Tabs.List` defaults `activateOnFocus={false}` (arrow keys move focus; Enter/Space is required to activate). This project's original wrapper never set `activationMode`, so it was silently relying on Radix's automatic default. Per the migration's hard rule and the skill's explicit wrapper-shapes.md guidance for tabs specifically, this is flagged rather than patched with `activateOnFocus` — restoring the old behavior is a one-line change (`<TabsPrimitive.List activateOnFocus ...>`) if the product decision is to keep automatic activation.

## Verify by hand

- Click between tabs; confirm the active tab's underline indicator slides/appears under the clicked tab and its panel content swaps.
- Keyboard: focus the tab list, use Left/Right (or Up/Down if vertical) arrow keys to move focus between tabs — note focus moves without activating the panel (this is the flagged manual-activation delta); press Enter or Space on a focused tab to activate it.
- Disabled tab (if any route uses one): confirm it's visually dimmed and unclickable, and that keyboard focus skips or does not activate it.
