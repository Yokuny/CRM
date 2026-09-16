# checkbox

2026-09-16, transformation engine (direct 1:1 mapping per universal-patterns.md coverage matrix), verdict: clean, one real bug fixed as part of the migration (dead `disabled:` classes).

## Changed

- `src/components/ui/checkbox.tsx` — swapped `import * as CheckboxPrimitive from '@radix-ui/react-checkbox'` for `import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox'` (unified subpath, exposes `.Root`/`.Indicator` exactly like the Radix shape it replaces). Type `ComponentProps<typeof CheckboxPrimitive.Root>` → `CheckboxPrimitive.Root.Props` (verified `Root.Props` resolves via `node_modules/@base-ui/react/checkbox/root/CheckboxRoot.d.ts`'s co-located `declare namespace CheckboxRoot { type Props }`, re-exported as `Root` in `index.parts.d.ts`).
  - `data-[state=checked]:` → `data-checked:` in both `checkboxVariants` variants (verified the real emitted attribute is the boolean-style `data-checked`/`data-unchecked`, not `data-state=`, via `node_modules/@base-ui/react/checkbox/root/CheckboxRootDataAttributes.d.ts`).
  - **Real bug fix, not just a rename**: `disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50` → `data-disabled:*`. Base UI's `Checkbox.Root` renders a `<span>` with a separate hidden `<input>` beside it (confirmed in `CheckboxRoot.js` JSDoc and the hidden input's `tabIndex: -1` — keyboard focus and the `disabled` boolean state live on the visible `<span>`, not a real form control), so the CSS `:disabled` pseudo-class these classes depended on can never match on a `<span>` — they'd have silently become dead code. `class-mapping.md` calls this out explicitly and says the shadcn base registry itself still ships the dead version as "an upstream quirk, not a pattern to copy" — fixed it properly here instead of reproducing the quirk.
  - `focus-visible:` classes verified safe to keep as-is: `useButton`'s wiring puts real keyboard focus on `Checkbox.Root` itself (not the hidden input), so `:focus-visible` still matches the right element.
  Leftover scan: `grep -n "radix-ui\|@radix-ui" checkbox.tsx` → no matches.

## Left alone

- `CheckboxIndicator`'s default mount behavior (`keepMounted: false`) already matches Radix's default unmount-when-unchecked `Presence` behavior — verified in `CheckboxIndicator.js` (`shouldRender = keepMounted || mounted`, defaults to hiding when unchecked) — no `forceMount`/`keepMounted` prop needed to preserve current behavior.
- Consumer sweep: checked every `<Checkbox>` call site (`dynamic-field.tsx`, `schedule/professionals/{index,details}.tsx`, `schedule/spaces/{index,details}.tsx`, `products/details.tsx`) — all use `checked`/`onCheckedChange`, which Radix already named this way, so no call-site changes needed. No consumer anywhere uses `checked="indeterminate"` (grepped the whole app) or the `indeterminate` prop, so that consumer-props.md behavior change is inert here.

## Behavior changes

None functionally — the `data-disabled:` fix restores intended behavior that Radix's own `<button>`-based Root gave for free, rather than introducing a new one.

## Verify by hand

- `/schedule/professionals` and `/schedule/spaces` "mostrar inativos" checkbox — click to toggle, confirm the checked visual state and border/bg color per variant.
- A disabled checkbox anywhere in the app (if any) — confirm cursor/opacity still visually indicate disabled (this is the bug fix; verify it, don't just trust the diff).
- Dynamic multi-select checkbox list (`dynamic-field.tsx`) — confirm keyboard Tab/Space still toggles each option.
