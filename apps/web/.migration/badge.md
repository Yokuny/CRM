# badge

2026-09-16, transformation engine (`useRender` + `mergeProps`), verdict: clean, no consumer changes needed.

## Changed

- `src/components/ui/badge.tsx` — `Badge`, `BadgeIndicator`, and `BadgeWithDelta` all swapped `Slot`/`asChild` for `useRender`/`mergeProps`.
  - `Badge`: straightforward, `state: { slot: 'badge' }` (not `variant` — the original never wrote a `data-variant` attribute here, only `data-slot`, so `variant` was deliberately left out of `state` to keep the DOM identical).
  - `BadgeWithDelta`: same shape, `children` (the delta icon + text) now passed through the `mergeProps` literal's `children` key instead of JSX nesting, since `useRender` returns a single element rather than something you nest JSX inside.
  - `BadgeIndicator`: the trickiest of the three — its original early-return (`if (!children) return <Dot .../>`, bypassing `Comp` entirely) can't gate a hook call. `useRender` is a hook (name starts with `use`) and must run unconditionally every render or React's rules-of-hooks are violated (confirmed: editing this in first drafted as an `if` before the hook call, and got a live "hook called conditionally" diagnostic from the IDE's linter before fixing it). Fixed by always calling `useRender` and using its own `enabled` parameter (documented as "useful for rendering a component conditionally", returns `null` when `false`) to gate whether its output is used, then branching on `hasChildren` only for the *return value*, not the hook call itself.
  Types: `BadgeProps`, `BadgeIndicatorProps`, `BadgeWithDeltaProps` rebased on `useRender.ComponentProps<'span'>` instead of `ComponentProps<'span'> & { asChild?: boolean }`.
  Leftover scan: `grep -n "radix-ui\|@radix-ui" badge.tsx` → no matches.

## Left alone

- `Status`, `StatusIndicator`, `StatusLabel`, `Dot` — plain elements or thin wrappers around `Badge`, no `Slot`/`asChild` of their own.
- No consumer in `apps/web/src` passes `asChild` to `Badge`/`BadgeIndicator`/`BadgeWithDelta` (confirmed via the project-wide `asChild` sweep) — zero call-site changes needed for this file.

## Behavior changes

None.

## Verify by hand

- Any page showing status badges (schedule calendar, orders list) — confirm colors/rings render unchanged.
- A badge indicator with a status label (e.g. inbox conversation list) — confirm the dot + text still render together, and one with no children (bare dot) still renders as just the dot.
