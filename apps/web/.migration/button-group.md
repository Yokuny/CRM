# button-group

2026-09-16, transformation engine (`useRender` + `mergeProps` for `ButtonGroupText`; `ButtonGroupSeparator` unaffected, already covered by [[separator]]), verdict: clean, no consumer changes needed.

## Changed

- `src/components/ui/button-group.tsx` — `ButtonGroupText` swapped `Slot`/`asChild` for `useRender`/`mergeProps`, `data-slot="button-group-text"` now via `state`. Updated the file's own header comment (previously described its `@radix-ui/react-slot` import choice vs. the project's `item.tsx`/`button.tsx`; now describes the `useRender`/`mergeProps` equivalent).
  Leftover scan: `grep -n "radix-ui\|@radix-ui" button-group.tsx` → no matches.

## Left alone

- `ButtonGroup` — plain `div`, no primitive dependency, untouched.
- `ButtonGroupSeparator` — already just a thin wrapper around `Separator` (migrated separately, see [[separator]]); no `Slot`/`asChild` here either.
- No consumer in `apps/web/src` passes `asChild` to `ButtonGroupText` — zero call-site changes needed.

## Behavior changes

None.

## Verify by hand

- Any `ButtonGroup` usage with a text segment (if present in the app) — confirm layout/border joins between segments are unchanged.
