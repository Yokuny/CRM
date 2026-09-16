# dropdown-menu

2026-09-16, transformation engine (golden-pair diff of `radix-sera`/`base-sera` dropdown-menu.json used to derive the canonical menu mapping, then replayed onto the project's existing customized markup — structure/classNames preserved, only the Radix→Base UI API surface changed), verdict: clean, one structural addition (Positioner) required by the API change, two behavior deltas flagged (not fixed).

## Changed

- `src/components/ui/dropdown-menu.tsx`
  - Import: `import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui'` → `import { Menu as MenuPrimitive } from '@base-ui/react/menu'` (DropdownMenu is not its own Base UI package; it maps to the generic `Menu` family per menus.md).
  - Part renames (all mechanical, from the canonical mapping table): `Root`→`Root`, `Portal`→`Portal`, `Trigger`→`Trigger`, `Group`→`Group`, `Item`→`Item`, `CheckboxItem`→`CheckboxItem`, `RadioGroup`→`RadioGroup`, `RadioItem`→`RadioItem`, `Separator`→`Separator` (all unchanged names); `Label`→`GroupLabel`, `ItemIndicator`→`CheckboxItemIndicator`/`RadioItemIndicator` (split by parent item type), `Sub`→`SubmenuRoot`, `SubTrigger`→`SubmenuTrigger` (renamed). Public wrapper function names (`DropdownMenuLabel`, `DropdownMenuSub`, `DropdownMenuSubTrigger`, etc.) were kept as-is — only the internal primitive reference changed.
  - All prop types switched from `ComponentProps<typeof DropdownMenuPrimitive.X>` to `MenuPrimitive.X.Props`, verified against the installed `@base-ui/react@1.8.0` `.d.ts` files (`menu/*/*.d.ts`) for every part touched.
  - `DropdownMenuContent` (line ~18) and `DropdownMenuSubContent` (line ~185): restructured from `Portal > Content` to `Portal > Positioner > Popup`, the biggest structural change in this migration (per universal-patterns.md "Portal/positioning model"). `align`/`alignOffset`/`side`/`sideOffset` moved off Content and onto the new `Positioner`; per the "Pick means FORWARD" rule I destructured all four and forward them explicitly to `<MenuPrimitive.Positioner>` (declare → destructure → forward, all three, checked for both functions) rather than letting them fall through `...props` onto the wrong DOM node.
    - `DropdownMenuContent` defaults: `align="center"`, `alignOffset=0`, `side="bottom"` added explicitly to preserve the exact visual behavior the original had implicitly via Radix's own defaults (the original never set these, relying on Radix `DropdownMenu.Content` defaults of side="bottom"/align="center"); `sideOffset=4` default carried over unchanged from the original.
    - `DropdownMenuSubContent` defaults: `align="start"`, `alignOffset={-3}`, `side="right"`, `sideOffset={0}` — these specific values come from the skill's documented ground-truth ("DropdownMenu SUBContent defaults") and are load-bearing for visual alignment against the parent menu item; Radix's `SubContent` implied `side="right"` automatically and defaulted `align="start"`, which Base UI's Positioner needs stated explicitly since there's no more implicit submenu-side behavior.
    - New `Positioner` gets `className="isolate z-50 outline-none"` per the documented menu-family convention (this is brand-new structure introduced by the API change, not a restyle of anything that existed before).
  - Class-string rewrites (mechanical value-attribute renames only; presence-attribute selectors like `data-[disabled]:`, `data-[inset]:`, `data-[variant=destructive]:` were left untouched since they're either identical in both libraries or project-specific custom attributes unrelated to Radix/Base UI):
    - Content/SubContent: `data-[state=closed]:` → `data-closed:`, `data-[state=open]:` → `data-open:`; `data-[side=...]:` left as bracket syntax (unchanged — Base UI also sets `data-side` as a value attribute, not presence).
    - CSS vars: `--radix-dropdown-menu-content-available-height` → `--available-height`, `--radix-dropdown-menu-content-transform-origin` → `--transform-origin`.
    - `DropdownMenuSubTrigger` (line ~161): `data-[state=open]:bg-accent`/`data-[state=open]:text-accent-foreground` → `data-popup-open:bg-accent`/`data-popup-open:text-accent-foreground` — this is the one exception to the generic open→`data-open` rule: submenu trigger open markers use Base UI's `data-popup-open` per menus.md, not `data-open`.
  - Leftover scan: `grep -n "radix-ui\|@radix-ui" dropdown-menu.tsx` → no matches.

## Left alone

- No consumer in `apps/web/src` imports from `dropdown-menu.tsx` outside the file itself — zero call-site changes needed.
- Kept `DropdownMenuSubContent` as its own standalone primitive-based implementation (duplicating the full Positioner/Popup class list) rather than switching it to compose the public `DropdownMenuContent` wrapper — that's how the project's original file already had it, and the task is a mechanical port, not a restructure toward the golden registry's own composition style.
- `components.json` / `package.json` not touched.

## Behavior changes

- **Checkbox/radio items no longer close the menu on click by default.** Base UI's `Menu.CheckboxItem` and `Menu.RadioItem` default `closeOnClick` to `false`; Radix's `CheckboxItem`/`RadioItem` closed the menu on select by default. Flagged per the migration's hard rule (not silently patched with an explicit `closeOnClick` — that would be a design decision, not a mechanical port).
- **`DropdownMenuLabel` (now backed by `Menu.GroupLabel`) expects to be rendered inside a `DropdownMenuGroup`** to correctly wire `aria-labelledby`; Radix's `Label` could float freely in the content without a parent group. No current consumer exists to check against, but flagging for future usage.
- `onSelect(event) { event.preventDefault() }` idiom (if ever added by a future consumer to keep the menu open) has no direct equivalent — it becomes `onClick` + `closeOnClick={false}` on `Menu.Item`. Not applicable today since no consumer uses `onSelect`.

## Verify by hand

- Open the dropdown via its trigger; confirm the menu appears below/aligned to the trigger in the same position as before.
- Keyboard: Arrow Down/Up moves highlight between items, Enter/Space selects, Escape closes and returns focus to the trigger.
- Typeahead: type the first letter(s) of an item's label to jump-highlight it.
- Hover a submenu trigger (if any menu in the app uses one) — submenu opens to the right, aligned with the trigger row, and closes when moving the pointer away.
- Click a checkbox/radio item — confirm the check/dot indicator toggles (and note per the flagged delta above that the menu may now stay open where it previously closed).
