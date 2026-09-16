# item

2026-09-16, transformation engine (`useRender` + `mergeProps`, non-button polymorphic component per universal-patterns.md worked example), verdict: clean.

## Changed

- `src/components/ui/item.tsx` — `Item` swapped `Slot`/`asChild` for `useRender`/`mergeProps`. Kept the project's own tag (`li`, not the golden registry's `div`) and exact `itemVariants` classes. `data-slot="item"`, `data-variant`, `data-size` are no longer written by hand — they come from `state: { slot: 'item', variant, size }`, which `useRender`'s internal `getStateAttributesProps` converts to the same three `data-*` attributes (verified in `node_modules/@base-ui/react/internals/getStateAttributesProps.js`: non-boolean truthy state values become `data-<key>="<value>"`), so the rendered DOM is unchanged.
  Leftover scan: `grep -n "radix-ui\|@radix-ui" item.tsx` → no matches.
- Consumer sweep (`asChild` → `render`), files needing only an **Item** fix:
  - `src/routes/_private/index.tsx` — 6 identical `<Item variant="outline" asChild><Link>...</Link></Item>` hub cards → `<Item variant="outline" render={<Link>...</Link>} />`.
  - `src/routes/_private/customers/index.tsx`, `schedule/index.tsx` — same shape, inside a `.map()`.
  - `src/routes/_private/processes/index.tsx` — single hub card, same shape.
- Consumer sweep, files needing **both** an Item and a Button fix (both diffs land here, so they're reported once, in this file):
  - `src/routes/_private/customers/details.tsx` — line 91 Button (`/processes/add` shortcut) and line 107 Item (process list row wrapping `<Link>`).
  - `src/routes/_private/kanban/index.tsx` — line 22 Button ("Adicionar" board) and line 39 Item (board row wrapping `<Link>`).

## Left alone

- `ItemGroup`, `ItemSeparator`, `ItemMedia`, `ItemContent`, `ItemTitle`, `ItemDescription`, `ItemActions`, `ItemHeader`, `ItemFooter` — none use `Slot`/`asChild`, untouched.

## Behavior changes

None observed. `useRender`'s state→data-attribute conversion reproduces the exact same three attributes the hand-written version set.

## Verify by hand

- Open `/` (private index hub), `/customers`, `/schedule`, `/processes` and click every card — confirm navigation still works and the `outline` variant border/hover still renders (it depends on `data-variant` reaching the `<li>`).
- Open a customer's details page and a kanban board list — confirm the process/board row `Item` still navigates via its wrapped `<Link>` and keeps its `hover:bg-accent/50` treatment (depends on the `[a]:hover:bg-accent/50` selector inside `itemVariants` matching the now-`render`-injected `<a>`).
