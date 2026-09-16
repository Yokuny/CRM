# switch

2026-09-16, transformation engine (direct 1:1 mapping per universal-patterns.md coverage matrix), verdict: clean, same dead-class fix as [[checkbox]].

## Changed

- `src/components/ui/switch.tsx` — swapped `import * as SwitchPrimitive from '@radix-ui/react-switch'` for `import { Switch as SwitchPrimitive } from '@base-ui/react/switch'` (unified subpath, `.Root`/`.Thumb`). Type → `SwitchPrimitive.Root.Props`.
  - `data-[state=checked]:`/`data-[state=unchecked]:` → `data-checked:`/`data-unchecked:` on both `Root` and `Thumb` (verified the boolean-style attributes via `node_modules/@base-ui/react/switch/root/SwitchRootDataAttributes.d.ts` and `.../thumb/SwitchThumbDataAttributes.d.ts` — same shape as checkbox).
  - `disabled:cursor-not-allowed disabled:opacity-50` → `data-disabled:*` — same reasoning as [[checkbox]]: `Switch.Root` also renders a `<span>` + hidden input, so `:disabled` never matches; fixed rather than reproduced.
  Leftover scan: `grep -n "radix-ui\|@radix-ui" switch.tsx` → no matches.

## Left alone

- Consumer sweep: only one call site outside `ui/`, `dynamic-field.tsx:156` (`<Switch id={name} checked={Boolean(field.value)} onCheckedChange={field.onChange} />`) — already uses `checked`/`onCheckedChange`, no change needed.

## Behavior changes

None functionally (same dead-class fix as checkbox, not a new behavior).

## Verify by hand

- Any dynamic boolean field rendered as a Switch (tenant-configured `type: 'boolean'` field via `dynamic-field.tsx`) — toggle it, confirm the thumb slides and the track color changes.
